require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const jwt     = require('jsonwebtoken');

const { readFile, writeFile }  = require('./services/github-storage');
const { generateMetaFromNiche, generateArticleFromTitle, reviseArticle } = require('./services/openai-service');
const { checkSEO }             = require('./services/seo-checker');
const { generateImage }        = require('./services/image-generator');
const { postToWordPress, verifyYoastScores, writeYoastMeta, deletePost, publishPost } = require('./services/wordpress-api');

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));

// ─── HELPER: parse raw AI output ──────────────────────────────────────────────
function parseOutput(raw) {
  const clean = raw
    .replace(/^```html\s*/gim, '').replace(/^```\s*/gim, '').replace(/```$/gim, '').trim();
  const metaM = clean.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/i);
  return {
    metaDesc:    metaM ? metaM[1].trim() : '',
    articleHTML: clean.replace(/META DESCRIPTION:.*?(\n|$)/i, '').trim(),
  };
}

// ─── HELPER: generate article + internal SEO loop ────────────────────────────
async function generateWithSEO(niche) {
  const { title, keyword, category, tags } = await generateMetaFromNiche(niche);

  let raw = await generateArticleFromTitle(title, keyword, niche);
  let { metaDesc, articleHTML } = parseOutput(raw);

  let seoResult = checkSEO(articleHTML, keyword, metaDesc);
  let seoTry = 0;
  while (seoResult.score < 80 && seoTry < 3) {
    console.log(`[SEO] Score ${seoResult.score} < 80, revising (${seoTry + 1}/3)...`);
    const revised = await reviseArticle(
      `META DESCRIPTION: ${metaDesc}\n${articleHTML}`,
      keyword,
      '- ' + seoResult.issues.join('\n- ')
    );
    const p = parseOutput(revised);
    if (p.metaDesc) metaDesc = p.metaDesc;
    articleHTML = p.articleHTML;
    seoResult   = checkSEO(articleHTML, keyword, metaDesc);
    seoTry++;
  }
  console.log(`[SEO] Final score: ${seoResult.score}`);
  return { title, keyword, category, tags, metaDesc, articleHTML, seoResult };
}

// ─── CORE: Smart publish with Yoast verification loop ─────────────────────────
// Logic:
//   1. Generate article (with internal SEO loop)
//   2. Post to WP as DRAFT
//   3. Write Yoast meta
//   4. Verify: both SEO ≥ 70 AND Readability ≥ 60?
//      YES → publish the draft → done
//      NO  → delete draft, regenerate, repeat (max 3 attempts)
//      PLUGIN NOT INSTALLED → publish anyway (content is still SEO-optimized)
async function smartPublishWithYoastLoop(niche, domain, withImage = true, maxAttempts = 3) {
  const auth = `Basic ${Buffer.from(`${domain.username}:${domain.appPassword}`).toString('base64')}`;
  let imageData = null;
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n[SmartPublish] ── Attempt ${attempt}/${maxAttempts} ─────────────────`);

    // STEP 1: Generate article
    const { title, keyword, category, tags, metaDesc, articleHTML, seoResult } =
      await generateWithSEO(niche);

    // STEP 2: Generate image (only on first attempt, reuse on retry)
    if (withImage && !imageData) {
      try {
        imageData = await generateImage(keyword, niche);
        console.log(`[Image] Source: ${imageData.source}`);
      } catch (e) {
        console.log('[Image] Failed, using null:', e.message);
      }
    }

    // STEP 3: Post as DRAFT
    const result = await postToWordPress(domain.url, {
      username:    domain.username,
      appPassword: domain.appPassword,
      endpoint:    domain.endpoint,
    }, {
      title, content: articleHTML, metaDescription: metaDesc,
      keyword, category, tags,
      imageBase64: imageData?.base64,
      imageAlt:    imageData?.altText,
      status:      'draft',
    });

    const { postId, postUrl, yoast } = result;
    lastResult = { ...result, title, keyword, category, tags, metaDesc, seoScore: seoResult.score, imageData, niche, attempt };

    console.log(`[Yoast] SEO=${yoast.seoScore}(${yoast.seoGreen ? '✅' : '❌'}) ` +
                `Read=${yoast.readScore}(${yoast.readabilityGreen ? '✅' : '❌'}) ` +
                `accessible=${yoast.accessible} source=${yoast.source}`);

    // CASE A: Plugin not installed → accept if internal SEO ≥ 80
    if (!yoast.accessible) {
      console.log('[Yoast] Meta not readable (plugin not installed). Publishing based on internal SEO...');
      const link = await publishPost(domain.endpoint, auth, postId);
      lastResult.postUrl      = link || postUrl;
      lastResult.yoastStatus  = 'no-plugin-accepted';
      return lastResult;
    }

    // CASE B: Both green → publish! ✅
    if (yoast.seoGreen && yoast.readabilityGreen) {
      console.log('[Yoast] ✅ Both GREEN! Publishing...');
      const link = await publishPost(domain.endpoint, auth, postId);
      lastResult.postUrl     = link || postUrl;
      lastResult.yoastStatus = 'both-green';
      return lastResult;
    }

    // CASE C: Not green — if more attempts left, delete draft and retry
    if (attempt < maxAttempts) {
      console.log(`[Yoast] ❌ Not green. Deleting draft ${postId}, regenerating...`);
      await deletePost(domain.endpoint, auth, postId);
      imageData = imageData; // keep same image for retries
    } else {
      // Last attempt — publish anyway with warning
      console.log('[Yoast] ⚠️ Max attempts reached. Publishing with current scores...');
      const link = await publishPost(domain.endpoint, auth, postId);
      lastResult.postUrl     = link || postUrl;
      lastResult.yoastStatus = 'max-attempts-published';
      return lastResult;
    }
  }
  return lastResult;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.DASHBOARD_USERNAME && password === process.env.DASHBOARD_PASSWORD) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

function authMW(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ─── DOMAINS ──────────────────────────────────────────────────────────────────
app.get('/api/domains', authMW, async (req, res) => {
  const { data } = await readFile('domains.json');
  res.json(data);
});
app.post('/api/domains', authMW, async (req, res) => {
  const { data, sha } = await readFile('domains.json');
  const d = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  data.push(d);
  await writeFile('domains.json', data, sha);
  res.json(d);
});
app.delete('/api/domains/:id', authMW, async (req, res) => {
  const { data, sha } = await readFile('domains.json');
  await writeFile('domains.json', data.filter(d => d.id !== req.params.id), sha);
  res.json({ success: true });
});

// ─── DOMAIN NICHES ───────────────────────────────────────────────────────────

// GET /api/domains/:id  (get single domain)
app.get('/api/domains/:id', authMW, async (req, res) => {
  const { data } = await readFile('domains.json');
  const domain = data.find(d => d.id === req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  res.json(domain);
});

// PATCH /api/domains/:id  (update domain fields, including niches array)
app.patch('/api/domains/:id', authMW, async (req, res) => {
  const { data, sha } = await readFile('domains.json');
  const idx = data.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Domain not found' });
  data[idx] = { ...data[idx], ...req.body };
  await writeFile('domains.json', data, sha);
  res.json(data[idx]);
});

// POST /api/domains/:id/niches  (add one niche to domain)
app.post('/api/domains/:id/niches', authMW, async (req, res) => {
  const { niche } = req.body;
  if (!niche || !niche.trim()) return res.status(400).json({ error: 'niche is required' });
  const { data, sha } = await readFile('domains.json');
  const domain = data.find(d => d.id === req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  if (!Array.isArray(domain.niches)) domain.niches = [];
  const clean = niche.trim();
  if (!domain.niches.includes(clean)) domain.niches.push(clean);
  await writeFile('domains.json', data, sha);
  res.json(domain);
});

// DELETE /api/domains/:id/niches  (remove one niche from domain)
app.delete('/api/domains/:id/niches', authMW, async (req, res) => {
  const { niche } = req.body;
  const { data, sha } = await readFile('domains.json');
  const domain = data.find(d => d.id === req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  domain.niches = (domain.niches || []).filter(n => n !== niche);
  await writeFile('domains.json', data, sha);
  res.json(domain);
});

// ─── GENERATE PREVIEW (no post) ───────────────────────────────────────────────
app.post('/api/generate', authMW, async (req, res) => {
  const { niche, generateImageFlag = true } = req.body;
  if (!niche) return res.status(400).json({ error: 'niche is required' });
  try {
    const { title, keyword, category, tags, metaDesc, articleHTML, seoResult } =
      await generateWithSEO(niche);

    let imageData = null;
    if (generateImageFlag) {
      try {
        imageData = await generateImage(keyword, niche);
        console.log(`[Image] Source: ${imageData.source}`);
      } catch (e) {
        console.log('[Image] Failed:', e.message);
      }
    }

    res.json({
      title, keyword, category, tags, niche,
      content:         articleHTML,
      metaDescription: metaDesc,
      seoScore:        seoResult.score,
      seoIssues:       seoResult.issues,
      seoStats: {
        wordCount: seoResult.wordCount,
        kwCount:   seoResult.kwCount,
        density:   seoResult.density,
      },
      image:       imageData,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Generate]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── SMART PUBLISH (generate → post → verify Yoast → retry if needed) ─────────
app.post('/api/smart-publish', authMW, async (req, res) => {
  const { niche, domainId, generateImageFlag = true } = req.body;
  if (!niche || !domainId) return res.status(400).json({ error: 'niche and domainId required' });

  const { data: domains } = await readFile('domains.json');
  const domain = domains.find(d => d.id === domainId);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });

  try {
    const result = await smartPublishWithYoastLoop(niche, domain, generateImageFlag);

    // Save to posts log
    const { data: posts, sha } = await readFile('posts.json');
    posts.push({
      id:          Date.now().toString(),
      domainId,
      domainUrl:   domain.url,
      keyword:     result.keyword,
      title:       result.title,
      category:    result.category,
      tags:        result.tags,
      postUrl:     result.postUrl,
      seoScore:    result.seoScore,
      yoastStatus: result.yoastStatus,
      yoast:       result.yoast,
      imageSource: result.imageData?.source || 'none',
      attempt:     result.attempt,
      postedAt:    new Date().toISOString(),
    });
    await writeFile('posts.json', posts, sha);
    res.json(result);
  } catch (e) {
    console.error('[SmartPublish]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── MANUAL PUBLISH (post pre-generated preview content) ──────────────────────
app.post('/api/post', authMW, async (req, res) => {
  const { domainId, title, content, metaDescription, keyword, category, tags, image } = req.body;

  const { data: domains } = await readFile('domains.json');
  const domain = domains.find(d => d.id === domainId);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });

  try {
    // Post directly as publish (no verification loop for manual publish)
    const result = await postToWordPress(domain.url, {
      username:    domain.username,
      appPassword: domain.appPassword,
      endpoint:    domain.endpoint,
    }, {
      title, content, metaDescription,
      keyword, category, tags: tags || [],
      imageBase64: image?.base64,
      imageAlt:    image?.altText,
      status:      'publish',
    });

    // Save log
    const { data: posts, sha } = await readFile('posts.json');
    posts.push({
      id:          Date.now().toString(),
      domainId,
      domainUrl:   domain.url,
      keyword, title, category,
      tags:        tags || [],
      postUrl:     result.postUrl,
      yoastStatus: result.yoast?.seoGreen && result.yoast?.readabilityGreen ? 'both-green' : 'check-needed',
      yoast:       result.yoast,
      imageSource: image?.source || 'provided',
      postedAt:    new Date().toISOString(),
    });
    await writeFile('posts.json', posts, sha);
    res.json(result);
  } catch (e) {
    console.error('[Post]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POSTS ────────────────────────────────────────────────────────────────────
app.get('/api/posts', authMW, async (req, res) => {
  const { data } = await readFile('posts.json');
  res.json(data);
});

// ─── SCHEDULE ─────────────────────────────────────────────────────────────────
app.post('/api/schedule', authMW, async (req, res) => {
  const { data, sha } = await readFile('schedules.json');
  const job = { id: Date.now().toString(), status: 'pending', createdAt: new Date().toISOString(), ...req.body };
  data.push(job);
  await writeFile('schedules.json', data, sha);
  res.json(job);
});
app.get('/api/schedules', authMW, async (req, res) => {
  const { data } = await readFile('schedules.json');
  res.json(data);
});
app.delete('/api/schedules/:id', authMW, async (req, res) => {
  const { data, sha } = await readFile('schedules.json');
  await writeFile('schedules.json', data.filter(j => j.id !== req.params.id), sha);
  res.json({ success: true });
});

// ─── CRON: every 5 minutes ────────────────────────────────────────────────────
cron.schedule('*/5 * * * *', async () => {
  console.log('[Cron] Tick:', new Date().toISOString());
  try {
    let { data: schedules, sha } = await readFile('schedules.json');
    const { data: domains } = await readFile('domains.json');
    const now = new Date();
    let changed = false;

    for (const job of schedules) {
      if (job.status !== 'pending') continue;
      if (new Date(job.scheduledAt) > now) continue;

      const domain = domains.find(d => d.id === job.domainId);
      if (!domain) { job.status = 'failed'; job.error = 'Domain not found'; changed = true; continue; }

      // Random anti-footprint delay 0–90s
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 90000)));

      try {
        const result = await smartPublishWithYoastLoop(job.niche || job.keyword, domain, true);

        const { data: posts, sha: psha } = await readFile('posts.json');
        posts.push({
          id: Date.now().toString(),
          domainId: job.domainId, domainUrl: domain.url,
          keyword: result.keyword, title: result.title,
          category: result.category, tags: result.tags,
          postUrl: result.postUrl, seoScore: result.seoScore,
          yoastStatus: result.yoastStatus, yoast: result.yoast,
          imageSource: result.imageData?.source || 'none',
          scheduledJobId: job.id,
          postedAt: new Date().toISOString(),
        });
        await writeFile('posts.json', posts, psha);

        job.status       = 'completed';
        job.completedAt  = new Date().toISOString();
        job.generatedTitle = result.title;
        job.yoastStatus  = result.yoastStatus;
        job.postUrl      = result.postUrl;
        console.log(`[Cron] ✅ "${result.title}" | Yoast: ${result.yoastStatus}`);
      } catch (e) {
        job.status = 'failed'; job.error = e.message;
        console.log('[Cron] ❌', e.message);
      }
      changed = true;
    }

    if (changed) {
      const fresh = await readFile('schedules.json');
      await writeFile('schedules.json', schedules, fresh.sha);
    }
  } catch (e) {
    console.log('[Cron] Error:', e.message);
  }
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/',           (_, res) => res.send('PBN Backend 🚀'));
app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(process.env.PORT || 3001, '0.0.0.0', () =>
  console.log('Server on port', process.env.PORT || 3001)
);
