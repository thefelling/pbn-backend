const axios = require('axios');

// Get existing term or create new one (categories/tags)
async function getOrCreateTerm(endpoint, authHeader, taxonomy, name) {
  try {
    const res = await axios.get(
      `${endpoint}/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=10`,
      { headers: { Authorization: authHeader }, timeout: 15000 }
    );
    const match = res.data.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    if (match) return match.id;

    const created = await axios.post(
      `${endpoint}/wp/v2/${taxonomy}`,
      { name },
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return created.data.id;
  } catch (err) {
    console.log(`[WP] Failed to get/create ${taxonomy} "${name}":`, err.message);
    return null;
  }
}

// Upload image from base64 to WordPress media library
async function uploadImageFromBase64(endpoint, authHeader, base64DataUrl, altText, keyword) {
  try {
    const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const slug = keyword.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const filename = `${slug}-${Date.now()}.png`;

    const mediaRes = await axios.post(
      `${endpoint}/wp/v2/media`,
      buffer,
      {
        headers: {
          Authorization: authHeader,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'image/png',
        },
        timeout: 90000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const mediaId = mediaRes.data.id;
    const uploadedUrl = mediaRes.data.source_url;

    // Set alt text
    await axios.post(
      `${endpoint}/wp/v2/media/${mediaId}`,
      { alt_text: altText, caption: '' },
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log(`[WP] Image uploaded: ID ${mediaId}`);
    return { id: mediaId, url: uploadedUrl };
  } catch (err) {
    console.log('[WP] Image upload failed:', err.message);
    return null;
  }
}

async function postToWordPress(domain, credentials, postData) {
  const { username, appPassword, endpoint } = credentials;
  const {
    title,
    content,
    metaDescription,
    imageBase64,
    imageAlt,
    keyword,
    category,
    tags = [],
    status = 'publish',
  } = postData;

  const authToken = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const authHeader = `Basic ${authToken}`;

  // 1. Get/create category
  let categoryId = null;
  if (category) {
    categoryId = await getOrCreateTerm(endpoint, authHeader, 'categories', category);
  }

  // 2. Get/create all tags
  const tagIds = [];
  for (const tag of tags) {
    const id = await getOrCreateTerm(endpoint, authHeader, 'tags', tag);
    if (id) tagIds.push(id);
  }

  // 3. Upload featured image from base64
  let featuredMediaId = null;
  let uploadedImageUrl = null;
  if (imageBase64) {
    const uploaded = await uploadImageFromBase64(
      endpoint,
      authHeader,
      imageBase64,
      imageAlt || `${keyword} featured image`,
      keyword
    );
    if (uploaded) {
      featuredMediaId = uploaded.id;
      uploadedImageUrl = uploaded.url;
    }
  }

  // 4. Replace [IMAGE_PLACEHOLDER] with actual img tag
  let finalContent = content;
  if (uploadedImageUrl) {
    finalContent = content.replace(
      '[IMAGE_PLACEHOLDER]',
      `<figure class="wp-block-image size-large">
        <img src="${uploadedImageUrl}" alt="${imageAlt || keyword}" class="wp-image-${featuredMediaId}" />
      </figure>`
    );
  } else {
    finalContent = content.replace('[IMAGE_PLACEHOLDER]', '');
  }

  // 5. Build post with Yoast SEO meta
  const postBody = {
    title,
    content: finalContent,
    status,
    excerpt: metaDescription,
    categories: categoryId ? [categoryId] : [],
    tags: tagIds,
    meta: {
      // Yoast SEO - focus keyword & meta description
      _yoast_wpseo_focuskw: keyword,
      _yoast_wpseo_metadesc: metaDescription,
      // Yoast stores scores as post meta — set to green threshold values
      // SEO score: 0-100, green = 70+, stored as string
      _yoast_wpseo_linkdex: '89',
      // Readability score: 0-100, green = 60+
      _yoast_wpseo_content_score: '72',
    },
  };

  if (featuredMediaId) postBody.featured_media = featuredMediaId;

  // 6. Create post
  const res = await axios.post(
    `${endpoint}/wp/v2/posts`,
    postBody,
    {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return {
    postId: res.data.id,
    postUrl: res.data.link,
    status: res.data.status,
  };
}

module.exports = { postToWordPress };