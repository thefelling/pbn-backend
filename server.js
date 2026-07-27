require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');

const { readFile, writeFile } = require('./services/github-storage');
const { generateArticle, reviseArticle } = require('./services/openai-service');
const { checkSEO } = require('./services/seo-checker');
const { generateImage } = require('./services/image-generator');
const { postToWordPress } = require('./services/wordpress-api');

const app = express();
app.use(cors());
app.use(express.json());

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
  const newDomain = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString(),
  };
  data.push(newDomain);
  await writeFile('domains.json', data, sha);
  res.json(newDomain);
});

app.delete('/api/domains/:id', authMiddleware, async (req, res) => {
  const { data, sha } = await readFile('domains.json');
  const filtered = data.filter(d => d.id !== req.params.id);
  await writeFile('domains.json', filtered, sha);
  res.json({ success: true });
});

// =================== CONTENT GENERATION ===================
app.post('/api/generate', authMiddleware, async (req, res) => {
  const { keyword, domainId, generateImageFlag = true } = req.body;

  try {
    let article = await generateArticle(keyword);
    let metaDesc = '';
    let articleHTML = article;

    // Parse meta description
    const metaMatch = article.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/);
    if (metaMatch) {
      metaDesc = metaMatch[1].trim();
      articleHTML = article.replace(/META DESCRIPTION:.*?\n/s, '').trim();
    }

    // SEO check loop
    let seoResult = checkSEO(articleHTML, keyword, metaDesc);
    let attempts = 0;

    while (seoResult.score < 80 && attempts < 3) {
      const feedback = seoResult.issues.join('\n- ');
      article = await reviseArticle(`META DESCRIPTION: ${metaDesc}\n${articleHTML}`, keyword, `- ${feedback}`);

      const metaMatch2 = article.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/);
      if (metaMatch2) {
        metaDesc = metaMatch2[1].trim();
        articleHTML = article.replace(/META DESCRIPTION:.*?\n/s, '').trim();
      }

      seoResult = checkSEO(articleHTML, keyword, metaDesc);
      attempts++;
    }

    // Extract title
    const titleMatch = articleHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '') : keyword;

    // Generate image
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
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

// =================== MANUAL POST ===================
app.post('/api/post', authMiddleware, async (req, res) => {
  const { domainId, title, content, metaDescription, keyword, image } = req.body;

  const { data: domains } = await readFile('domains.json');
  const domain = domains.find(d => d.id === domainId);
  if (!domain) return res.status(404).json({ error: 'Domain not found' });

  try {
    const result = await postToWordPress(
      domain.url,
      {
        username: domain.username,
        appPassword: domain.appPassword,
        endpoint: domain.endpoint,
      },
      { title, content, metaDescription, keyword, imageUrl: image?.url, imageAlt: image?.altText }
    );

    // Log to posts.json
    const { data: posts, sha } = await readFile('posts.json');
    posts.push({
      id: Date.now().toString(),
      domainId,
      domainUrl: domain.url,
      keyword,
      title,
      postUrl: result.postUrl,
      postedAt: new Date().toISOString(),
    });
    await writeFile('posts.json', posts, sha);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts', authMiddleware, async (req, res) => {
  const { data } = await readFile('posts.json');
  res.json(data);
});

// =================== CRON JOB (auto scheduler) ===================
cron.schedule('*/5 * * * *', async () => {
  const { data: schedules, sha } = await readFile('schedules.json');
  const { data: domains } = await readFile('domains.json');
  const now = new Date();
  let changed = false;

  for (const job of schedules) {
    if (job.status !== 'pending') continue;
    const scheduledTime = new Date(job.scheduledAt);
    if (now >= scheduledTime) {
      const domain = domains.find(d => d.id === job.domainId);
      if (!domain) { job.status = 'failed'; job.error = 'Domain not found'; changed = true; continue; }

      // Random delay for anti-footprint
      const delay = Math.floor(Math.random() * 60000); // 0-60 seconds
      await new Promise(r => setTimeout(r, delay));

      try {
        // Generate if not pre-generated
        let content = job.content;
        let title = job.title;
        let metaDesc = job.metaDescription;
        let image = job.image;

        if (!content) {
          const article = await generateArticle(job.keyword);
          const metaMatch = article.match(/META DESCRIPTION:\s*(.*?)(?:\n|$)/);
          metaDesc = metaMatch ? metaMatch[1].trim() : '';
          const articleHTML = article.replace(/META DESCRIPTION:.*?\n/s, '').trim();
          const titleMatch = articleHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
          title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '') : job.keyword;
          content = articleHTML;
          try { image = await generateImage(job.keyword); } catch {}
        }

        await postToWordPress(domain.url, {
          username: domain.username,
          appPassword: domain.appPassword,
          endpoint: domain.endpoint,
        }, { title, content, metaDescription: metaDesc, keyword: job.keyword, imageUrl: image?.url, imageAlt: image?.altText });

        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        changed = true;
      } catch (err) {
        job.status = 'failed';
        job.error = err.message;
        changed = true;
      }
    }
  }

  if (changed) await writeFile('schedules.json', schedules, sha);
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});