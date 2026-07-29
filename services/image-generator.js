const OpenAI = require('openai');
const axios  = require('axios');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tiap niche punya array VISUALS — dipilih random setiap generate
const NICHE_MAP = [
  {
    keys: ['gambl','casino','slot','jackpot','roulett','poker','blackjack',
           'betting','wager','spin','chip','monte carlo','dice','card game',
           'parlay','togel','baccarat','craps','lottery','house edge',
           'near-miss','skinner','operant','chance','probability','risk reward',
           'random','winning','gambling psychology','gaming origin'],
    visuals: [
      'red roulette wheel spinning on green casino table close-up photorealistic dramatic lighting',
      'golden slot machine with jackpot coins waterfall neon casino lights winners',
      'poker cards and chips stack on casino table player hands cinematic',
      'casino dice rolling on craps table excitement motion blur dramatic',
      'luxury baccarat table VIP casino gold red elegant cards chips',
    ],
    bg: ['#1a0030','#3d0060','#c084fc'],
  },
  {
    keys: ['crypto','bitcoin','ethereum','blockchain','defi','nft','token','web3','altcoin','satoshi'],
    visuals: [
      'glowing gold bitcoin coin floating digital network holographic dark background',
      'blockchain network nodes glowing blue cryptocurrency futuristic technology',
      'ethereum coin abstract digital art purple glow tech background',
      'crypto wallet coins portfolio growth chart futuristic finance',
      'defi decentralized finance blockchain abstract neon city night',
    ],
    bg: ['#0a1628','#1e3a5f','#f59e0b'],
  },
  {
    keys: ['forex','trading','stock','market','invest','fund','finance','wealth','dividend','wall street'],
    visuals: [
      'stock market green chart arrows up financial trading screen data',
      'wall street bull golden coins dollar bills success wealth',
      'stock broker trading desk multiple screens charts graphs',
      'investment portfolio growth bar chart financial success concept',
      'forex currency exchange rates global market abstract data',
    ],
    bg: ['#0a1a0a','#1a3a1a','#22c55e'],
  },
  {
    keys: ['health','fitness','gym','workout','diet','nutrition','wellness','exercise','muscle','weight loss'],
    visuals: [
      'gym dumbbells weights fitness equipment bright professional photo',
      'healthy food salad fruit vegetables colorful nutrition flat lay',
      'athlete running outdoors fitness motivation sunrise dramatic',
      'yoga meditation wellness calm peaceful nature morning light',
      'protein shake supplements gym bag workout equipment flat lay',
    ],
    bg: ['#0a2e1a','#1a5c3a','#10b981'],
  },
  {
    keys: ['tech','software','code','coding','programming','developer','artificial intelligence',
           'machine learning','data science','cloud','saas','algorithm','neural network','ai'],
    visuals: [
      'futuristic glowing circuit board blue technology computer chips',
      'code lines on laptop screen dark room programmer developer',
      'artificial intelligence neural network brain holographic blue',
      'cloud computing abstract data center server lights',
      'software dashboard UI dark mode modern interface laptop screen',
    ],
    bg: ['#0a0a1a','#1a1a3e','#6366f1'],
  },
  {
    keys: ['travel','vacation','tourism','hotel','flight','destination','adventure','beach','island','backpack'],
    visuals: [
      'tropical beach paradise sunset palm trees crystal blue water aerial drone',
      'mountain peak adventure hiker dramatic clouds epic landscape',
      'luxury hotel infinity pool sunset ocean view resort',
      'ancient temple travel destination golden hour magical light',
      'travel backpack map camera passport wanderlust adventure',
    ],
    bg: ['#0a1a2e','#1a3a5e','#0ea5e9'],
  },
  {
    keys: ['food','recipe','cooking','restaurant','cuisine','meal','eat','dish','culinary','chef','baking'],
    visuals: [
      'gourmet food dish fine dining close-up appetizing photography',
      'fresh ingredients colorful vegetables herbs top view flat lay',
      'chef cooking restaurant kitchen flames professional dramatic',
      'homemade baking bread pastry warm cozy kitchen lifestyle',
      'food spread feast table party colorful diverse dishes overhead',
    ],
    bg: ['#1a0a00','#3a1a00','#f97316'],
  },
  {
    keys: ['fashion','style','clothing','outfit','luxury','brand','apparel','streetwear','designer'],
    visuals: [
      'luxury fashion editorial clean white background modern style',
      'streetwear outfit aesthetic urban minimal photography',
      'designer accessories handbag shoes flat lay elegant marble',
      'fashion model editorial dramatic lighting studio photoshoot',
      'luxury brand products perfume watch jewelry dark elegant',
    ],
    bg: ['#1a0a1a','#3a1a3a','#ec4899'],
  },
  {
    keys: ['real estate','property','house','home','apartment','mortgage','rent','interior','architecture','villa'],
    visuals: [
      'modern luxury villa exterior architecture pool sunset garden',
      'minimalist interior living room bright natural light furniture',
      'aerial drone view suburban neighborhood houses streets',
      'luxury apartment city view panoramic windows modern interior',
      'home keys sold sign real estate success agent handshake',
    ],
    bg: ['#0a1a10','#1a3a20','#16a34a'],
  },
  {
    keys: ['business','startup','entrepreneur','marketing','sales','strategy','management','leadership','productivity'],
    visuals: [
      'business team meeting modern office glass walls strategy whiteboard',
      'entrepreneur laptop coffee shop startup working focused',
      'handshake deal success professional business partnership',
      'marketing strategy mind map planning creative office concept',
      'leadership motivational concept silhouette mountain top sunrise',
    ],
    bg: ['#0a0a18','#1a1a38','#3b82f6'],
  },
  {
    keys: ['education','learning','study','school','university','course','training','knowledge','academic','student'],
    visuals: [
      'open books library knowledge warm light studying concept',
      'graduation cap diploma achievement success university',
      'online learning laptop student desk focused studying',
      'school classroom chalkboard education bright modern',
      'stack of books pencils apple teacher education concept',
    ],
    bg: ['#0a1828','#1a3848','#0891b2'],
  },
  {
    keys: ['beauty','skincare','makeup','cosmetics','hair','grooming','glow','skin','face','serum'],
    visuals: [
      'luxury skincare products cream serum pink marble background flat lay',
      'makeup palette brushes professional beauty cosmetics',
      'glowing skin face beauty portrait natural light',
      'hair care products salon professional styling tools',
      'beauty routine morning skincare steps minimalist aesthetic',
    ],
    bg: ['#1a0a10','#3a1a28','#db2777'],
  },
  {
    keys: ['sport','soccer','football','basketball','tennis','athlete','competition','game','race','olympic'],
    visuals: [
      'football stadium crowd game night dramatic lighting aerial',
      'athlete sprint finish line winning competition dramatic',
      'basketball player dunk action shot arena crowd',
      'tennis court ball racket professional match dramatic',
      'championship trophy gold winner celebration team sport',
    ],
    bg: ['#0a1a0a','#1a3a1a','#65a30d'],
  },
  {
    keys: ['music','song','artist','band','concert','instrument','melody','audio','sound','guitar','piano'],
    visuals: [
      'concert stage lights crowd music performer dramatic neon',
      'guitar player studio recording microphone atmospheric',
      'piano keys close up elegant black white music',
      'vinyl record music studio mixing desk professional',
      'music festival crowd confetti celebration energy',
    ],
    bg: ['#1a0a28','#2a1a48','#8b5cf6'],
  },
  {
    keys: ['mental health','psychology','anxiety','stress','mindfulness','therapy','brain','cognitive','behavior'],
    visuals: [
      'peaceful meditation forest sunlight zen calm mindfulness',
      'brain neural connections glowing psychology abstract',
      'therapy counseling warm safe room comfortable calm',
      'mindfulness journaling morning ritual peaceful desk',
      'nature walk serene path trees sunlight wellness',
    ],
    bg: ['#0a1a18','#1a3a38','#14b8a6'],
  },
];

const DEFAULT_VISUALS = [
  'professional modern workspace minimal clean concept',
  'abstract corporate innovation light geometric clean',
  'business technology modern minimal professional concept',
];

const STYLE_VARIANTS = [
  'photorealistic high quality professional photography',
  'digital illustration vibrant modern clean',
  'cinematic dramatic lighting depth of field',
  'editorial flat lay overhead view clean background',
  'concept art detailed vivid professional',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function detectNiche(keyword, niche = '') {
  const hay = `${keyword} ${niche}`.toLowerCase();
  for (const e of NICHE_MAP) {
    if (e.keys.some(k => hay.includes(k))) {
      return { visual: pick(e.visuals), bg: e.bg };
    }
  }
  return { visual: pick(DEFAULT_VISUALS), bg: ['#0a0a18','#1a1a38','#6366f1'] };
}

async function urlToBase64(url, ms = 45000) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: ms,
    headers: { 'User-Agent': 'Mozilla/5.0 PBNBot/1.0' },
    maxRedirects: 5,
  });
  return Buffer.from(res.data).toString('base64');
}

async function tryDallE(keyword, niche) {
  const { visual } = detectNiche(keyword, niche);
  const style = pick(STYLE_VARIANTS);
  const prompt = `${visual}. ${style}. Blog header 16:9. NO text, NO letters, NO words, NO watermarks, NO numbers.`;
  const res = await client.images.generate({
    model: 'dall-e-3', prompt, n: 1, size: '1792x1024', quality: 'standard',
  });
  const b64 = await urlToBase64(res.data[0].url, 90000);
  console.log(`[Image] DALL-E: "${visual.slice(0,60)}"`);
  return { base64: `data:image/png;base64,${b64}`, altText: `${keyword} featured image`, source: 'dalle3' };
}

async function tryPollinations(keyword, niche) {
  const { visual } = detectNiche(keyword, niche);
  const style = pick(STYLE_VARIANTS);
  const seed = Math.floor(Math.random() * 999999);
  const prompt = encodeURIComponent(`${visual}, ${style}, no text, no letters, no watermarks`);
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=630&seed=${seed}&nologo=true&enhance=true&negative=text,letters,words,abstract,blurry`;
  console.log('[Image] Pollinations...');
  const b64 = await urlToBase64(url, 60000);
  return { base64: `data:image/jpeg;base64,${b64}`, altText: `${keyword} featured image`, source: 'pollinations' };
}

async function tryUnsplash(keyword, niche) {
  const { visual } = detectNiche(keyword, niche);
  const q = encodeURIComponent(visual.split(' ').slice(0, 5).join(' '));
  const url = `https://source.unsplash.com/1200x628/?${q}&t=${Date.now()}`;
  console.log('[Image] Unsplash...');
  const b64 = await urlToBase64(url, 30000);
  return { base64: `data:image/jpeg;base64,${b64}`, altText: `${keyword} featured image`, source: 'unsplash' };
}

function makeSVG(keyword, niche) {
  const { bg } = detectNiche(keyword, niche);
  const [c0, c1, c2] = bg;
  const label = keyword.length > 52 ? keyword.slice(0, 52) + '…' : keyword;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628">
  <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c0}"/><stop offset="100%" stop-color="${c1}"/></linearGradient><filter id="f"><feGaussianBlur stdDeviation="50"/></filter></defs>
  <rect width="1200" height="628" fill="url(#g)"/>
  <ellipse cx="${200 + Math.random()*100|0}" cy="${120 + Math.random()*80|0}" rx="220" ry="180" fill="${c2}" opacity="0.13" filter="url(#f)"/>
  <ellipse cx="${950 + Math.random()*100|0}" cy="${480 + Math.random()*80|0}" rx="260" ry="200" fill="${c2}" opacity="0.11" filter="url(#f)"/>
  <rect x="80" y="272" width="1040" height="1" fill="${c2}" opacity="0.4"/>
  <rect x="80" y="356" width="1040" height="1" fill="${c2}" opacity="0.4"/>
  <text x="600" y="338" font-family="Georgia,serif" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle" opacity="0.96">${label}</text>
  <text x="600" y="380" font-family="Arial,sans-serif" font-size="13" fill="${c2}" text-anchor="middle" letter-spacing="5" opacity="0.65">FEATURED ARTICLE</text>
</svg>`;
  return { base64: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, altText: `${keyword} featured image`, source: 'svg-fallback' };
}

async function generateImage(keyword, niche = '') {
  console.log(`[Image] keyword="${keyword}" niche="${niche.slice(0,40)}"`);
  try { return await tryDallE(keyword, niche); } catch(e) { console.log('[Image] DALL-E fail:', e.message); }
  try { return await tryPollinations(keyword, niche); } catch(e) { console.log('[Image] Pollinations fail:', e.message); }
  try { return await tryUnsplash(keyword, niche); } catch(e) { console.log('[Image] Unsplash fail:', e.message); }
  return makeSVG(keyword, niche);
}

module.exports = { generateImage };
