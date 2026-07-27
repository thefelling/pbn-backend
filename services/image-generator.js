const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateImage(prompt) {
  try {
    const response = await client.images.generate({
      model: 'dall-e-2',   // ← ubah ke dall-e-2
      prompt: `Create a visually stunning, high-quality featured image for an article about: "${prompt}". The image should be professional, clean, and suitable for a blog post.`,
      size: '1024x1024',
      quality: 'standard', // tidak semua model support quality, tapi aman
      n: 1,
    });
    const imageUrl = response.data[0].url;
    // download & convert ke base64
    const imageRes = await fetch(imageUrl);
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return {
      base64: `data:image/png;base64,${base64}`,
      altText: prompt,
      url: imageUrl,
    };
  } catch (err) {
    console.error('Image generation error:', err.message);
    throw err;
  }
}

module.exports = { generateImage };