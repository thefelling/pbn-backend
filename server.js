require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');

const { readFile, writeFile } = require('./services/github-storage');
const { generateMetaFromNiche, generateArticleFromTitle, reviseArticle } = require('./services/openai-service');
const { checkSEO } = require('./services/seo-checker');
const { generateImage } = require('./services/image-generator');
const { postToWordPress } = require('./services/wordpress-api');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' })); // base64 images can be large

// =================== AUTH ===================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.DASHBOARD_USERNAME &&
    password === process.env.DASHBOARD_PASSWORD
  ) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// =================== DOMAINS ===================
app.get('/api/domains', authMiddleware, async (req, res) => {
  const { data } = await readFile('domains.json');
  res.json(data);
});

app.post('/api/domains', authMiddleware, async (req, res) => {
  const { data, sha } = await readFile('domains.json');
  const newDomain = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  data.push(newDomain);
  await writeFile('domains.json', data, sha);
  res.json(newDomain);
});

app.delete('/api/domains/:id', authMiddleware, async (req, res) => {
  const { data, sha } = await readFile('domains.json');
  await writeFile('domains.json', data.filter((d) => d.id !== req.params.id), sha);
  res.json({ success: true });
});

// =================== CONTENT GENERATION ===================
app.post('/api/generate', authMiddleware, async (req, res) => {
  const { niche, generateImageFlag = true } = req.body;
  if (!niche) return res.status(400).json({ error: 'niche is required' });

  try {
    // Step 1: Generate meta from niche
    const meta = await generateMetaFromNiche(niche);
    const { title, keyword, category, tags } = meta;

    // Step 2: Write article
    let raw = await generateArticleFromTitle(title, keyword, niche);

    // Parse meta description
    let metaDesc = '';
    const metaMatch = raw.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/);
    if (metaMatch) {
      metaDesc = metaMatch[1].trim();
      raw = raw.replace(/META DESCRIPTION:.*?(\n|$)/, '').trim();
    }
    let articleHTML = raw;

    // Step 3: SEO loop (max 3 attempts)
    let seoResult = checkSEO(articleHTML, keyword, metaDesc);
    let attempts = 0;
    while (seoResult.score < 80 && attempts < 3) {
      const feedback = '- ' + seoResult.issues.join('\n- ');
      const revised = await reviseArticle(
        `META DESCRIPTION: ${metaDesc}\n${articleHTML}`,
        keyword,
        feedback
      );
      const m2 = revised.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/);
      if (m2) {
        metaDesc = m2[1].trim();
        articleHTML = revised.replace(/META DESCRIPTION:.*?(\n|$)/, '').trim();
      } else {
        articleHTML = revised;
      }
      seoResult = checkSEO(articleHTML, keyword, metaDesc);
      attempts++;
    }

    // Step 4: Generate image (downloads buffer immediately, returns base64)
    let imageData = null;
    if (generateImageFlag) {
      try {
        imageData = await generateImage(keyword);
      } catch (e) {
        console.log('Image gen failed:', e.message);
      }
    }

    res.json({
      title,
      content: articleHTML,
      metaDescription: metaDesc,
      keyword,
      niche,
      category,
      tags,
      seoScore: seoResult.score,
      seoIssues: seoResult.issues,
      seoStats: {
        wordCount: seoResult.wordCount,
        kwCount: seoResult.kwCount,
        density: seoResult.density,
      },
      image: imageData,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =================== MANUAL POST ===================
app.post('/api/post', authMiddleware, async (req, res) => {
  const { domainId, title, content, metaDescription, keyword, category, tags, image } = req.body;

  const { data: domains } = await readFile('domains.json');
  const domain = domains.find((d) => d.id === domainId);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });

  try {
    const result = await postToWordPress(
      domain.url,
      { username: domain.username, appPassword: domain.appPassword, endpoint: domain.endpoint },
      {
        title,
        content,
        metaDescription,
        keyword,
        category,
        tags,
        imageBase64: image?.base64,
        imageAlt: image?.altText,
      }
    );

    // Log post
    const { data: posts, sha } = await readFile('posts.json');
    posts.push({
      id: Date.now().toString(),
      domainId,
      domainUrl: domain.url,
      keyword,
      title,
      category,
      tags,
      postUrl: result.postUrl,
      postedAt: new Date().toISOString(),
    });
    await writeFile('posts.json', posts, sha);

    res.json(result);
  } catch (err) {
    console.error('Post error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts', authMiddleware, async (req, res) => {
  const { data } = await readFile('posts.json');
  res.json(data);
});

// =================== SCHEDULER ===================
app.post('/api/schedule', authMiddleware, async (req, res) => {
  const { data, sha } = await readFile('schedules.json');
  const job = {
    id: Date.now().toString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...req.body,
  };
  data.push(job);
  await writeFile('schedules.json', data, sha);
  res.json(job);
});

app.get('/api/schedules', authMiddleware, async (req, res) => {
  const { data } = await readFile('schedules.json');
  res.json(data);
});

// =================== CRON (every 5 min) ===================
cron.schedule('*/5 * * * *', async () => {
  console.log('[Cron] Checking schedules...');
  let { data: schedules, sha } = await readFile('schedules.json');
  const { data: domains } = await readFile('domains.json');
  const now = new Date();
  let changed = false;

  for (const job of schedules) {
    if (job.status !== 'pending') continue;
    if (new Date(job.scheduledAt) > now) continue;

    const domain = domains.find((d) => d.id === job.domainId);
    if (!domain) {
      job.status = 'failed';
      job.error = 'Domain not found';
      changed = true;
      continue;
    }

    // Random delay 0–90s (anti-footprint)
    const delay = Math.floor(Math.random() * 90000);
    await new Promise((r) => setTimeout(r, delay));

    try {
      // Generate from niche
      const meta = await generateMetaFromNiche(job.niche);
      const { title, keyword, category, tags } = meta;
      let raw = await generateArticleFromTitle(title, keyword, job.niche);

      let metaDesc = '';
      const m = raw.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/);
      if (m) { metaDesc = m[1].trim(); raw = raw.replace(/META DESCRIPTION:.*?(\n|$)/, '').trim(); }

      // SEO check
      let seoResult = checkSEO(raw, keyword, metaDesc);
      if (seoResult.score < 80) {
        const revised = await reviseArticle(`META DESCRIPTION: ${metaDesc}\n${raw}`, keyword, '- ' + seoResult.issues.join('\n- '));
        const m2 = revised.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/);
        if (m2) { metaDesc = m2[1].trim(); raw = revised.replace(/META DESCRIPTION:.*?(\n|$)/, '').trim(); }
      }

      // Generate image
      let imageData = null;
      try { imageData = await generateImage(keyword); } catch (e) { console.log('Cron image fail:', e.message); }

      await postToWordPress(
        domain.url,
        { username: domain.username, appPassword: domain.appPassword, endpoint: domain.endpoint },
        { title, content: raw, metaDescription: metaDesc, keyword, category, tags, imageBase64: imageData?.base64, imageAlt: imageData?.altText }
      );

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.generatedTitle = title;
      console.log(`[Cron] Posted: ${title}`);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      console.log('[Cron] Job failed:', err.message);
    }
    changed = true;
  }

  if (changed) {
    const fresh = await readFile('schedules.json');
    await writeFile('schedules.json', schedules, fresh.sha);
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server on port ${process.env.PORT || 3001}`);
});