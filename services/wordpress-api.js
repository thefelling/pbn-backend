const axios = require('axios');

async function postToWordPress(domain, credentials, postData) {
  const { username, appPassword, endpoint } = credentials;
  const { title, content, metaDescription, imageUrl, imageAlt, status = 'publish' } = postData;

  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  };

  // Upload featured image if provided
  let featuredMediaId = null;
  if (imageUrl) {
    try {
      const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imgBuffer = Buffer.from(imgResponse.data);
      
      const mediaRes = await axios.post(
        `${endpoint}/wp/v2/media`,
        imgBuffer,
        {
          headers: {
            ...headers,
            'Content-Disposition': `attachment; filename="${Date.now()}.png"`,
            'Content-Type': 'image/png',
          },
        }
      );
      featuredMediaId = mediaRes.data.id;

      // Set alt text
      await axios.post(
        `${endpoint}/wp/v2/media/${featuredMediaId}`,
        { alt_text: imageAlt },
        { headers }
      );
    } catch (e) {
      console.log('Image upload failed, posting without image:', e.message);
    }
  }

  // Create post
  const postBody = {
    title,
    content,
    status,
    meta: {
      _yoast_wpseo_metadesc: metaDescription,
      _yoast_wpseo_focuskw: postData.keyword,
    },
  };

  if (featuredMediaId) postBody.featured_media = featuredMediaId;

  const res = await axios.post(`${endpoint}/wp/v2/posts`, postBody, { headers });

  return {
    postId: res.data.id,
    postUrl: res.data.link,
    status: res.data.status,
  };
}

module.exports = { postToWordPress };