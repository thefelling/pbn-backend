const OpenAI = require('openai');
const axios  = require('axios');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── NICHE MAP ────────────────────────────────────────────────────────────────
// keys   = kata yang dicari di keyword/niche (lowercase)
// visual = prompt konkret untuk DALL-E & Pollinations
// bg     = warna SVG fallback [dark, mid, accent]
const NICHE_MAP = [
  {
    keys: ['gambl','casino','slot','jackpot','roulett','poker','blackjack',
           'betting','wager','spin','chip','monte carlo','dice','card game',
           'parlay','togel','baccarat','craps','lottery','winning odds',
           'house edge','near-miss','operant conditioning','skinner','gamification',
           'random','chance','probability','risk reward'],
    visual: 'casino slot machine gold coins chips playing cards roulette wheel dice on green felt table, photorealistic, rich and vibrant',
    bg: ['#1a0030','#3d0060','#c084fc'],
  },
  {
    keys: ['crypto','bitcoin','ethereum','blockchain','defi','nft','token','web3','altcoin','satoshi','crypto wallet'],
    visual: 'glowing bitcoin gold coin blockchain network digital holographic, dark background, futuristic',
    bg: ['#0a1628','#1e3a5f','#f59e0b'],
  },
  {
    keys: ['forex','trading','stock','market','invest','fund','finance','wealth','dividend','portfolio','hedge fund','wall street'],
    visual: 'stock market trading green chart arrows going up financial graphs dollar coins pile, photorealistic',
    bg: ['#0a1a0a','#1a3a1a','#22c55e'],
  },
  {
    keys: ['health','fitness','gym','workout','diet','nutrition','wellness','exercise','muscle','weight loss','bodybuilding'],
    visual: 'fitness gym dumbbells healthy food salad protein shake athletic person running, bright vibrant',
    bg: ['#0a2e1a','#1a5c3a','#10b981'],
  },
  {
    keys: ['tech','software','code','coding','programming','developer','artificial intelligence','machine learning','data science','cloud','saas','algorithm','neural network'],
    visual: 'futuristic digital technology circuit board glowing blue code lines laptop screen hologram',
    bg: ['#0a0a1a','#1a1a3e','#6366f1'],
  },
  {
    keys: ['travel','vacation','tourism','hotel','flight','destination','adventure','beach','island','backpack','journey'],
    visual: 'beautiful tropical beach island sunset palm trees crystal blue water aerial view, stunning landscape photography',
    bg: ['#0a1a2e','#1a3a5e','#0ea5e9'],
  },
  {
    keys: ['food','recipe','cooking','restaurant','cuisine','meal','eat','dish','culinary','chef','baking','gourmet'],
    visual: 'gourmet food dish fine dining restaurant colorful fresh ingredients top view flat lay, appetizing photography',
    bg: ['#1a0a00','#3a1a00','#f97316'],
  },
  {
    keys: ['fashion','style','clothing','outfit','luxury','brand','apparel','wear','streetwear','designer'],
    visual: 'luxury fashion elegant clothing on mannequin designer handbag shoes modern studio lighting',
    bg: ['#1a0a1a','#3a1a3a','#ec4899'],
  },
  {
    keys: ['real estate','property','house','home','apartment','mortgage','rent','interior','architecture','villa'],
    visual: 'modern luxury house exterior architecture swimming pool garden sunset beautiful home design',
    bg: ['#0a1a10','#1a3a20','#16a34a'],
  },
  {
    keys: ['business','startup','entrepreneur','marketing','sales','strategy','management','leadership','productivity','office'],
    visual: 'professional business meeting teamwork modern office success handshake strategy whiteboard',
    bg: ['#0a0a18','#1a1a38','#3b82f6'],
  },
  {
    keys: ['education','learning','study','school','university','course','training','knowledge','academic','student'],
    visual: 'open books education knowledge library bright light pencils graduation cap stack of books',
    bg: ['#0a1828','#1a3848','#0891b2'],
  },
  {
    keys: ['beauty','skincare','makeup','cosmetics','hair','grooming','glow','skin','face','moisturizer','serum'],
    visual: 'luxury skincare products beauty cosmetics moisturizer serum pink background elegant flat lay',
    bg: ['#1a0a10','#3a1a28','#db2777'],
  },
  {
    keys: ['sport','soccer','football','basketball','tennis','athlete','competition','game','race','olympic'],
    visual: 'professional athlete sport stadium crowd action shot dynamic motion blur champion',
    bg: ['#0a1a0a','#1a3a1a','#65a30d'],
  },
  {
    keys: ['music','song','artist','band','concert','instrument','melody','audio','sound','guitar','piano'],
    visual: 'music studio microphone guitar piano neon lights concert stage dramatic lighting',
    bg: ['#1a0a28','#2a1a48','#8b5cf6'],
  },
  {
    keys: ['mental health','psychology','anxiety','stress','mindfulness','therapy','brain','emotion','cognitive','behavior'],
    visual: 'peaceful meditation nature forest sunlight calm serene mindfulness zen wellness',
    bg: ['#0a1a18','#1a3a38','#14b8a6'],
  },
];

const DEFAULT = {
  visual: 'professional modern abstract business concept clean minimalist design',
  bg: ['#0a0a18','#1a1a38','#6366f1'],
};

// ─── DETECT NICHE from keyword + niche string ─────────────────────────────────
function detectNiche(keyword, niche = '') {
  const haystack = `${keyword} ${niche}`.toLowerCase();
  for (const entry of NICHE_MAP) {
    if (entry.keys.some(k => haystack.includes(k))) return entry;
  }
  return DEFAULT;
}

// ─── DOWNLOAD URL to base64 ───────────────────────────────────────────────────
async function urlToBase64(url, ms = 45000) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: ms,
    headers: { 'User-Agent': 'Mozilla/5.0 PBNBot/1.0' },
    maxRedirects: 5,
  });
  return Buffer.from(res.data).toString('base64');
}

// ─── LAYER 1: DALL-E 3 ───────────────────────────────────────────────────────
async function tryDallE(keyword, niche) {
  const { visual } = detectNiche(keyword, niche);

  const prompt = `${visual}. High quality blog header image, 16:9 ratio. ` +
    `Professional photography or illustration style. ` +
    `NO text, NO letters, NO words, NO watermarks, NO numbers anywhere in the image.`;

  const res = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
  });

  const b64 = await urlToBase64(res.data[0].url, 90000);
  console.log(`[Image] ✅ DALL-E 3 | visual: "${visual.slice(0,50)}..."`);
  return { base64: `data:image/png;base64,${b64}`, altText: `${keyword} featured image`, source: 'dalle3' };
}

// ─── LAYER 2: Pollinations AI (free, no key) ─────────────────────────────────
async function tryPollinations(keyword, niche) {
  const { visual } = detectNiche(keyword, niche);
  const seed   = Math.floor(Math.random() * 999999);
  // Tambah negative prompt untuk hindari abstract/weird
  const prompt = encodeURIComponent(
    `${visual}, professional blog cover photo, photorealistic, high quality, ` +
    `no text, no letters, no watermarks, no abstract shapes`
  );
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=630&seed=${seed}&nologo=true&enhance=true&negative=text,letters,words,abstract,blurry,low+quality`;

  console.log('[Image] Trying Pollinations...');
  const b64 = await urlToBase64(url, 60000);
  return { base64: `data:image/jpeg;base64,${b64}`, altText: `${keyword} featured image`, source: 'pollinations' };
}

// ─── LAYER 3: Unsplash (free, no key) ────────────────────────────────────────
async function tryUnsplash(keyword, niche) {
  const { visual } = detectNiche(keyword, niche);
  // Ambil 3-4 kata paling deskriptif dari visual
  const q = encodeURIComponent(
    visual.split(',')[0].split(' ').slice(0, 5).join(' ')
  );
  const url = `https://source.unsplash.com/1200x628/?${q}&t=${Date.now()}`;
  console.log('[Image] Trying Unsplash...');
  const b64 = await urlToBase64(url, 30000);
  return { base64: `data:image/jpeg;base64,${b64}`, altText: `${keyword} featured image`, source: 'unsplash' };
}

// ─── LAYER 4: SVG fallback (always works) ────────────────────────────────────
function makeSVG(keyword, niche) {
  const { bg } = detectNiche(keyword, niche);
  const [c0, c1, c2] = bg;
  const label = keyword.length > 52 ? keyword.slice(0, 52) + '…' : keyword;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c0}"/>
      <stop offset="100%" stop-color="${c1}"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="50"/></filter>
  </defs>
  <rect width="1200" height="628" fill="url(#g)"/>
  <ellipse cx="200" cy="120" rx="220" ry="180" fill="${c2}" opacity="0.13" filter="url(#glow)"/>
  <ellipse cx="1000" cy="520" rx="260" ry="200" fill="${c2}" opacity="0.11" filter="url(#glow)"/>
  <rect x="80" y="272" width="1040" height="1" fill="${c2}" opacity="0.4"/>
  <rect x="80" y="356" width="1040" height="1" fill="${c2}" opacity="0.4"/>
  <text x="600" y="338" font-family="Georgia,serif" font-size="40" font-weight="700"
        fill="#ffffff" text-anchor="middle" opacity="0.96">${label}</text>
  <text x="600" y="380" font-family="Arial,sans-serif" font-size="13"
        fill="${c2}" text-anchor="middle" letter-spacing="5" opacity="0.65">FEATURED ARTICLE</text>
</svg>`;

  console.log('[Image] ✅ SVG fallback');
  return {
    base64: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    altText: `${keyword} featured image`,
    source: 'svg-fallback',
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function generateImage(keyword, niche = '') {
  console.log(`[Image] Generating for keyword="${keyword}" niche="${niche}"`);

  try { return await tryDallE(keyword, niche); }
  catch (e) { console.log('[Image] DALL-E failed:', e.message); }

  try { return await tryPollinations(keyword, niche); }
  catch (e) { console.log('[Image] Pollinations failed:', e.message); }

  try { return await tryUnsplash(keyword, niche); }
  catch (e) { console.log('[Image] Unsplash failed:', e.message); }

  return makeSVG(keyword, niche);
}

module.exports = { generateImage };
