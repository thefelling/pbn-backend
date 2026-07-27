// services/image-generator.js
async function generateImage(prompt) {
  try {
    // URL API Pollinations, langsung return image
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024`;
    
    // Fetch gambar dari URL
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`HTTP error! status: ${imageRes.status}`);
    
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    return {
      base64: `data:image/jpeg;base64,${base64}`,
      altText: prompt,
      url: imageUrl,
    };
  } catch (error) {
    console.error('Image generation failed:', error.message);
    // Fallback ke gambar default (misal dari Pixabay)
    // ... kode fallback kamu ...
  }
}

module.exports = { generateImage };