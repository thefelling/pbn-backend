// services/image-generator.js
// Mendukung OpenAI DALL-E jika tersedia, tetapi fallback ke Picsum jika gagal

const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateImage(prompt) {
  // Coba gunakan OpenAI DALL-E terlebih dahulu
  try {
    const response = await client.images.generate({
      model: 'dall-e-3', // coba dall-e-3 dulu
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
    console.log('OpenAI DALL-E failed, falling back to Picsum:', err.message);
    // Fallback ke Picsum (gambar gratis)
    const seed = encodeURIComponent(prompt.replace(/\s+/g, '-'));
    const imageUrl = `https://picsum.photos/seed/${seed}/1024/1024`;
    const imageRes = await fetch(imageUrl);
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return {
      base64: `data:image/jpeg;base64,${base64}`,
      altText: prompt,
      url: imageUrl,
    };
  }
}

module.exports = { generateImage };