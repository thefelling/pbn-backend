// services/image-generator.js
const OpenAI = require('openai');

// Client OpenAI untuk DALL-E (jika nanti API key-nya di-upgrade)
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fungsi untuk ekstrak kata kunci utama dari prompt (biar relevan)
function extractSearchTerm(prompt) {
  const stopWords = ['the', 'of', 'and', 'for', 'to', 'a', 'an', 'is', 'on', 'at', 'with', 'from', 'by', 'as', 'in', 'that', 'it', 'or', 'for', 'are', 'about'];
  const words = prompt.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ');
  
  // Cari kata pertama yang bukan stopword dan panjang > 2
  for (const word of words) {
    if (!stopWords.includes(word) && word.length > 2) {
      return word;
    }
  }
  return 'gambling'; // default
}

async function generateImage(prompt) {
  // ========== 1. COBA DALL-E (jika API key support) ==========
  try {
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: `Create a visually stunning, high-quality featured image for an article about: "${prompt}". The image should be professional, clean, and suitable for a blog post.`,
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
    console.log('OpenAI DALL-E failed, falling back to LoremFlickr:', err.message);

    // ========== 2. FALLBACK KE LOREMFLICKK (Tag-based, GRATIS) ==========
    try {
      // Ambil kata kunci utama (misal: "gambling", "casino", "slot")
      const searchTerm = extractSearchTerm(prompt);
      // Tambahkan beberapa kata kunci turunan untuk memperkaya hasil
      const tags = [searchTerm, 'gambling', 'casino'].join(',');
      
      // Buat URL dengan timestamp agar tidak di-cache
      const imageUrl = `https://loremflickr.com/1024/1024/${encodeURIComponent(tags)}?random=${Date.now()}`;
      
      console.log(`[Image] Fetching from LoremFlickr with tags: ${tags}`);
      
      const imageRes = await fetch(imageUrl, { 
        timeout: 15000 
      });
      
      if (!imageRes.ok) throw new Error(`HTTP ${imageRes.status}`);
      
      const buffer = await imageRes.arrayBuffer();
      // Cek apakah buffer berisi gambar (bukan HTML error)
      const contentType = imageRes.headers.get('content-type') || '';
      if (contentType.includes('text') || buffer.byteLength < 5000) {
        throw new Error('Invalid image response');
      }
      
      const base64 = Buffer.from(buffer).toString('base64');
      return {
        base64: `data:image/jpeg;base64,${base64}`,
        altText: prompt,
        url: imageUrl,
      };
      
    } catch (fallbackErr) {
      console.log('LoremFlickr failed, using default fallback:', fallbackErr.message);
      
      // ========== 3. ULTIMATE FALLBACK: Gambar Default (Base64 Chip Casino) ==========
      // Gambar kecil 100x100 placeholder (kita kirim base64 minimal)
      const defaultBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // Pixel merah minimal
      return {
        base64: `data:image/png;base64,${defaultBase64}`,
        altText: prompt + ' (default)',
        url: 'https://via.placeholder.com/1x1',
      };
    }
  }
}

module.exports = { generateImage };