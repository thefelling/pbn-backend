// services/image-generator.js
const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fungsi untuk membuat prompt berdasarkan niche/keyword asli
function buildImagePrompt(topic) {
  // Kata-kata yang menunjukkan topik sudah jelas gambling
  const gamblingIndicators = ['gambling', 'casino', 'slot', 'roulette', 'poker', 'blackjack', 'dice', 'bet', 'togel', 'parlay', 'odds', 'wager', 'jackpot', 'chips', 'cards', 'wheel'];
  
  const lowerTopic = topic.toLowerCase();
  let hasGamblingContext = false;
  for (const word of gamblingIndicators) {
    if (lowerTopic.includes(word)) {
      hasGamblingContext = true;
      break;
    }
  }

  // Jika topik sudah mengandung kata gambling, pakai persis niche-nya.
  // Jika tidak, tambahkan konteks "gambling" agar tetap nyambung dengan artikel.
  let basePrompt = topic;
  if (!hasGamblingContext) {
    basePrompt = `${topic}, gambling context`;
  }

  // Tambahkan instruksi kualitas dan gaya tanpa mengubah substansi topik
  return `A professional high-quality featured image for a blog article about: "${basePrompt}". The image should visually represent the core concept, be creative, photorealistic, and suitable for a modern blog.`;
}

async function generateImage(prompt) {
  // ===== 1. COBA DALL-E (jika API key support) =====
  try {
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: `A professional, high-quality featured image for an article about: "${prompt}". Photorealistic, creative, suitable for a blog.`,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });
    const imageUrl = response.data[0].url;
    const imageRes = await fetch(imageUrl);
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return {
      base64: `data:image/png;base64,${base64}`,
      altText: prompt,
      url: imageUrl,
    };
  } catch (err) {
    console.log('DALL-E failed:', err.message);
  }

  // ===== 2. POLLINATIONS AI (Gratis, Tanpa API Key) =====
  try {
    const imagePrompt = buildImagePrompt(prompt);
    console.log(`[Image] Pollinations prompt: ${imagePrompt}`);
    
    // Encode prompt untuk URL
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
    
    const imageRes = await fetch(imageUrl, { timeout: 20000 });
    if (!imageRes.ok) throw new Error(`HTTP ${imageRes.status}`);
    
    const buffer = await imageRes.arrayBuffer();
    // Cek ukuran buffer (jika terlalu kecil, kemungkinan error)
    if (buffer.byteLength < 5000) throw new Error('Image too small, likely error');
    
    const base64 = Buffer.from(buffer).toString('base64');
    return {
      base64: `data:image/jpeg;base64,${base64}`,
      altText: prompt,
      url: imageUrl,
    };
  } catch (err) {
    console.log('Pollinations failed:', err.message);
  }

  // ===== 3. FALLBACK: Gambar Slot Machine dari Pixabay =====
  try {
    console.log('[Image] Using fallback slot machine image');
    const defaultImageUrl = 'https://cdn.pixabay.com/photo/2017/01/14/12/59/slot-machine-1979444_960_720.jpg';
    const imageRes = await fetch(defaultImageUrl, { timeout: 10000 });
    if (imageRes.ok) {
      const buffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return {
        base64: `data:image/jpeg;base64,${base64}`,
        altText: 'Slot machine',
        url: defaultImageUrl,
      };
    }
  } catch (err) {
    console.log('Fallback image failed:', err.message);
  }

  // ===== 4. ULTIMATE FALLBACK: Base64 minimal =====
  const chipBase64 = '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';
  return {
    base64: `data:image/png;base64,${chipBase64}`,
    altText: 'Casino chip',
    url: 'https://cdn.pixabay.com/photo/2016/09/19/12/10/casino-1682058_960_720.jpg',
  };
}

module.exports = { generateImage };