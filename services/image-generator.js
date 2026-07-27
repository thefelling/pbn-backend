const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateImage(keyword) {
  const prompt = `Professional blog header image for an article about "${keyword}". Clean, modern, high quality, no text overlay.`;

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
  });

  return {
    url: response.data[0].url,
    altText: `${keyword} - featured image`,
  };
}

module.exports = { generateImage };