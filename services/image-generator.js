/**
 * IMAGE GENERATOR — 4 Layer Fallback
 * Layer 1: DALL-E 3 (OpenAI)
 * Layer 2: Pollinations.ai (free, no key)
 * Layer 3: Unsplash Source (free, no key)
 * Layer 4: SVG (always works, niche-colored)
 */

const OpenAI = require('openai');
const axios  = require('axios');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── NICHE → VISUAL KEYWORD MAP ──────────────────────────────────────────────
const NICHE_VISUALS = [
  { keys: ['gambling','casino','slot','jackpot','roulette','poker','blackjack','betting','bet','wager','spin','chip'],
    visual: 'slot machine casino chips coins gambling table cards',
    svgColor: ['#1a0a2e','#2d1b69','#a855f7'] },

  { keys: ['crypto','bitcoin','ethereum','blockchain','defi','nft','token','web3','altcoin','satoshi'],
    visual: 'cryptocurrency bitcoin blockchain digital golden coins',
    svgColor: ['#0a1628','#1e3a5f','#f59e0b'] },

  { keys: ['forex','trading','stock','market','invest','fund','finance','wealth','economy','dividend'],
    visual: 'stock market trading charts graphs financial data',
    svgColor: ['#0a1a0a','#1a3a1a','#22c55e'] },

  { keys: ['health','fitness','gym','workout','diet','nutrition','wellness','exercise','body','muscle'],
    visual: 'fitness gym workout healthy lifestyle athlete running',
    svgColor: ['#0a2e1a','#1a5c3a','#10b981'] },

  { keys: ['tech','software','code','coding','programming','developer','ai','machine learning','data','cloud'],
    visual: 'technology software code laptop programming futuristic',
    svgColor: ['#0a0a1a','#1a1a3e','#6366f1'] },

  { keys: ['travel','vacation','tourism','hotel','flight','destination','adventure','trip','journey'],
    visual: 'travel adventure scenic mountain beach destination landscape',
    svgColor: ['#0a1a2e','#1a3a5e','#0ea5e9'] },

  { keys: ['food','recipe','cooking','restaurant','cuisine','meal','eat','dish','culinary','chef'],
    visual: 'food restaurant delicious meal cooking fresh ingredients',
    svgColor: ['#1a0a00','#3a1a00','#f97316'] },

  { keys: ['fashion','style','clothing','outfit','luxury','brand','apparel','wear','design'],
    visual: 'fashion style luxury clothing elegant design modern',
    svgColor: ['#1a0a1a','#3a1a3a','#ec4899'] },

  { keys: ['real estate','property','house','home','apartment','mortgage','rent','building'],
    visual: 'modern house property real estate architecture home',
    svgColor: ['#0a1a10','#1a3a20','#16a34a'] },

  { keys: ['business','startup','entrepreneur','marketing','sales','strategy','management','brand','growth'],
    visual: 'business professional office strategy meeting corporate',
    svgColor: ['#0a0a18','#1a1a38','#3b82f6'] },

  { keys: ['education','learning','study','school','university','course','training','knowledge','academic'],
    visual: 'education books learning knowledge library university',
    svgColor: ['#0a1828','#1a3848','#0891b2'] },

  { keys: ['beauty','skincare','makeup','cosmetics','hair','grooming','glow','skin','face'],
    visual: 'beauty skincare makeup cosmetics radiant glow luxury',
    svgColor: ['#1a0a10','#3a1a28','#db2777'] },

  { keys: ['sport','soccer','football','basketball','tennis','athlete','competition','game','race'],
    visual: 'sports athlete competition stadium professional action',
    svgColor: ['#0a1a0a','#1a3a1a','#65a30d'] },

  { keys: ['music','song','artist','band','concert','instrument','melody','audio','sound'],
    visual: 'music concert instruments studio microphone performance',
    svgColor: ['#1a0a28','#2a1a48','#8b5cf6'] },

  { keys: ['mental health','psychology','anxiety','stress','mindfulness','therapy','brain','emotion'],
    visual: 'mindfulness peaceful nature calm mental wellness',
    svgColor: ['#0a1a18','#1a3a38','#14b8a6'] },
];

const DEFAULT_VISUAL = { visual: 'professional modern abstract business concept', svgColor: ['#0a0a18','#1a1a38','#6366f1'] };

function detectNiche(keyword) {
  const kw = keyword.toLowerCase();
  for (const entry of NICHE_VISUALS) {
    if (entry.keys.some(k => kw.includes(k))) return entry;
  }
  return DEFAULT_VISUAL;
}

// ─── DOWNLOAD URL → BASE64 ────────────────────────────────────────────────────
async function urlToBase64(url, timeoutMs = 45000) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    headers: { 'User-Agent': 'Mozilla/5.0 PBNBot/1.0' },
    maxRedirects: 5,
  });
  return Buffer.from(res.data).toString('base64');
}

// ─── LAYER 1: DALL-E 3 ────────────────────────────────────────────────────────
async function tryDallE(keyword) {
  const { visual } = detectNiche(keyword);
  const styles = [
    'flat minimalist illustration, soft pastel gradient background',
    'isometric digital art, clean geometric shapes, modern color palette',
    'abstract editorial illustration, bold shapes, vibrant professional colors',
  ];
  const style = styles[Math.floor(Math.random() * styles.length)];

  const res = await client.images.generate({
    model: 'dall-e-3',
    prompt: `${visual}. ${style}. Blog header, 16:9, NO text, NO letters, NO watermarks, NO numbers. High quality.`,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
  });

  // Download immediately — URL expires in ~1 hour
  const b64 = await urlToBase64(res.data[0].url, 90000);
  console.log('[Image] ✅ DALL-E 3 success');
  return { base64: `data:image/png;base64,${b64}`, altText: `${keyword} featured image`, source: 'dalle3' };
}

// ─── LAYER 2: POLLINATIONS AI (free, no key) ──────────────────────────────────
async function tryPollinations(keyword) {
  const { visual } = detectNiche(keyword);
  const seed   = Math.floor(Math.random() * 999999);
  const prompt = encodeURIComponent(`${visual}, professional blog cover, no text, high quality, clean design`);
  const url    = `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=630&seed=${seed}&nologo=true&enhance=true`;
  console.log('[Image] Trying Pollinations.ai...');
  const b64 = await urlToBase64(url, 60000);
  return { base64: `data:image/jpeg;base64,${b64}`, altText: `${keyword} featured image`, source: 'pollinations' };
}

// ─── LAYER 3: UNSPLASH SOURCE (free, no key) ──────────────────────────────────
async function tryUnsplash(keyword) {
  const { visual } = detectNiche(keyword);
  const q   = encodeURIComponent(visual.split(' ').slice(0, 4).join(','));
  const url = `https://source.unsplash.com/1200x628/?${q}&sig=${Date.now()}`;
  console.log('[Image] Trying Unsplash...');
  const b64 = await urlToBase64(url, 30000);
  return { base64: `data:image/jpeg;base64,${b64}`, altText: `${keyword} featured image`, source: 'unsplash' };
}

// ─── LAYER 4: SVG FALLBACK (always works, never fails) ────────────────────────
function makeSVG(keyword, niche) {
  const entry = detectNiche(niche || keyword);
  const [c0, c1, c2] = entry.svgColor;
  const label = keyword.length > 48 ? keyword.slice(0, 48) + '…' : keyword;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c0}"/>
      <stop offset="100%" stop-color="${c1}"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="40" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="1200" height="628" fill="url(#g)"/>
  <circle cx="180" cy="130" r="200" fill="${c2}" opacity="0.12" filter="url(#glow)"/>
  <circle cx="1020" cy="500" r="240" fill="${c2}" opacity="0.10" filter="url(#glow)"/>
  <circle cx="600" cy="314" r="120" fill="${c2}" opacity="0.06" filter="url(#glow)"/>
  <rect x="80" y="265" width="1040" height="1" fill="${c2}" opacity="0.35"/>
  <rect x="80" y="363" width="1040" height="1" fill="${c2}" opacity="0.35"/>
  <text x="600" y="335" font-family="Georgia,Times,serif" font-size="42" font-weight="700"
        fill="#ffffff" text-anchor="middle" opacity="0.95" letter-spacing="-0.5">${label}</text>
  <text x="600" y="380" font-family="Arial,Helvetica,sans-serif" font-size="13"
        fill="${c2}" text-anchor="middle" opacity="0.6" letter-spacing="6">FEATURED ARTICLE</text>
</svg>`;

  console.log('[Image] ✅ SVG fallback used');
  return {
    base64: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    altText: `${keyword} featured image`,
    source: 'svg-fallback',
  };
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
async function generateImage(keyword, niche = '') {
  try { return await tryDallE(keyword); }
  catch (e) { console.log('[Image] DALL-E failed:', e.message); }

  try { return await tryPollinations(keyword); }
  catch (e) { console.log('[Image] Pollinations failed:', e.message); }

  try { return await tryUnsplash(keyword); }
  catch (e) { console.log('[Image] Unsplash failed:', e.message); }

  return makeSVG(keyword, niche);
}

module.exports = { generateImage };
