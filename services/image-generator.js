const OpenAI = require('openai');
const axios = require('axios');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateImage(keyword) {
  const styleVariants = [
    'flat illustration style, minimalist geometric shapes',
    'isometric illustration, modern and clean',
    'abstract digital art, flowing shapes and gradients',
    'professional infographic style illustration',
  ];
  const style = styleVariants[Math.floor(Math.random() * styleVariants.length)];

  const prompt = `Professional blog header image for an article about "${keyword}". 
${style}. 
Soft color palette, no text, no letters, no words, no numbers. 
High quality, visually appealing, suitable for a professional blog.`;

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
  });

  const imageUrl = response.data[0].url;

  // Download IMMEDIATELY — DALL-E URLs expire in ~1 hour
  const imgRes = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  const buffer = Buffer.from(imgRes.data);
  const base64 = buffer.toString('base64');

  return {
    base64: `data:image/png;base64,${base64}`,
    altText: `${keyword} - featured image`,
  };
}

module.exports = { generateImage };