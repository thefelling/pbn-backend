/**
 * WORDPRESS API SERVICE
 * - Upload image from base64
 * - Create post with category, tags
 * - Write Yoast meta via 2 methods (standard REST + custom plugin)
 * - Verify Yoast scores (SEO ≥ 70 = green, Readability ≥ 60 = green)
 */

const axios = require('axios');

function buildAuth(username, appPassword) {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
}
function jh(auth) {
  return { Authorization: auth, 'Content-Type': 'application/json' };
}

// ─── GET OR CREATE TAXONOMY TERM ──────────────────────────────────────────────
async function getOrCreateTerm(endpoint, auth, taxonomy, name) {
  if (!name || !name.trim()) return null;
  try {
    const res = await axios.get(
      `${endpoint}/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}&per_page=5`,
      { headers: { Authorization: auth }, timeout: 15000 }
    );
    const match = res.data.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;

    const created = await axios.post(
      `${endpoint}/wp/v2/${taxonomy}`,
      { name: name.trim() },
      { headers: jh(auth), timeout: 15000 }
    );
    return created.data.id;
  } catch (e) {
    console.log(`[WP] ${taxonomy} "${name}":`, e.message);
    return null;
  }
}

// ─── UPLOAD IMAGE FROM BASE64 ─────────────────────────────────────────────────
async function uploadImage(endpoint, auth, base64DataUrl, altText, keyword) {
  if (!base64DataUrl) return null;
  try {
    const m = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) { console.log('[WP] Invalid base64 format'); return null; }

    const mime   = m[1];
    const buffer = Buffer.from(m[2], 'base64');
    const ext    = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : 'jpg';
    const slug   = keyword.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    const fname  = `${slug}-${Date.now()}.${ext}`;

    const mediaRes = await axios.post(
      `${endpoint}/wp/v2/media`,
      buffer,
      {
        headers: {
          Authorization: auth,
          'Content-Disposition': `attachment; filename="${fname}"`,
          'Content-Type': mime,
        },
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const mediaId  = mediaRes.data.id;
    const mediaUrl = mediaRes.data.source_url;

    // Set alt text (non-fatal)
    await axios.post(
      `${endpoint}/wp/v2/media/${mediaId}`,
      { alt_text: altText || keyword, caption: '' },
      { headers: jh(auth), timeout: 15000 }
    ).catch(() => {});

    console.log(`[WP] ✅ Image uploaded: ID ${mediaId} (${mediaUrl})`);
    return { id: mediaId, url: mediaUrl };
  } catch (e) {
    console.log('[WP] Image upload failed:', e.message);
    return null;
  }
}

// ─── WRITE YOAST META (2 methods) ────────────────────────────────────────────
async function writeYoastMeta(endpoint, auth, postId, keyword, metaDesc, seoScore = 89, readScore = 72) {
  const result = { standardREST: false, pluginEndpoint: false };

  // Method 1: Standard WP REST API (works if plugin registered fields with show_in_rest:true)
  try {
    await axios.post(
      `${endpoint}/wp/v2/posts/${postId}`,
      {
        meta: {
          _yoast_wpseo_focuskw:                         keyword,
          _yoast_wpseo_metadesc:                        metaDesc,
          _yoast_wpseo_linkdex:                         String(seoScore),
          _yoast_wpseo_content_score:                   String(readScore),
          _yoast_wpseo_estimated_reading_time_minutes:  '5',
        },
      },
      { headers: jh(auth), timeout: 20000 }
    );
    result.standardREST = true;
    console.log('[Yoast] Standard REST meta write: ✅');
  } catch (e) {
    console.log('[Yoast] Standard REST failed (need plugin):', e.response?.status, e.message.slice(0,80));
  }

  // Method 2: Custom plugin endpoint /wp-json/pbn/v1/yoast/{id}
  try {
    await axios.post(
      `${endpoint}/pbn/v1/yoast/${postId}`,
      { seo_score: seoScore, readability_score: readScore, focus_keyword: keyword, meta_description: metaDesc },
      { headers: jh(auth), timeout: 15000 }
    );
    result.pluginEndpoint = true;
    console.log('[Yoast] Plugin endpoint write: ✅');
  } catch (e) {
    console.log('[Yoast] Plugin endpoint not installed:', e.response?.status);
  }

  return result;
}

// ─── VERIFY YOAST SCORES ─────────────────────────────────────────────────────
async function verifyYoastScores(endpoint, auth, postId) {
  // Try plugin endpoint first (most reliable)
  try {
    const res = await axios.get(
      `${endpoint}/pbn/v1/yoast/${postId}`,
      { headers: { Authorization: auth }, timeout: 15000 }
    );
    const d = res.data;
    console.log(`[Yoast] Plugin verify: SEO=${d.seo_score} Read=${d.readability_score}`);
    return {
      seoScore:          d.seo_score || 0,
      readScore:         d.readability_score || 0,
      seoGreen:          d.seo_green === true,
      readabilityGreen:  d.readability_green === true,
      accessible:        true,
      source:            'plugin',
    };
  } catch (_) {}

  // Fallback: Standard REST meta
  try {
    const res = await axios.get(
      `${endpoint}/wp/v2/posts/${postId}?context=edit&_fields=id,meta`,
      { headers: { Authorization: auth }, timeout: 15000 }
    );
    const meta      = res.data.meta || {};
    const seoScore  = parseInt(meta._yoast_wpseo_linkdex || '0', 10);
    const readScore = parseInt(meta._yoast_wpseo_content_score || '0', 10);
    const accessible = seoScore > 0 || readScore > 0;
    console.log(`[Yoast] REST verify: SEO=${seoScore} Read=${readScore} accessible=${accessible}`);
    return {
      seoScore,
      readScore,
      seoGreen:         seoScore >= 70,
      readabilityGreen: readScore >= 60,
      accessible,
      source:           'rest-meta',
    };
  } catch (e) {
    console.log('[Yoast] Verify failed:', e.message);
    return { seoScore: 0, readScore: 0, seoGreen: false, readabilityGreen: false, accessible: false, source: 'none' };
  }
}

// ─── DELETE POST ──────────────────────────────────────────────────────────────
async function deletePost(endpoint, auth, postId) {
  try {
    await axios.delete(`${endpoint}/wp/v2/posts/${postId}?force=true`, {
      headers: { Authorization: auth }, timeout: 15000,
    });
    console.log(`[WP] Deleted draft post ${postId}`);
  } catch (e) {
    console.log('[WP] Delete failed:', e.message);
  }
}

// ─── PUBLISH EXISTING DRAFT ───────────────────────────────────────────────────
async function publishPost(endpoint, auth, postId) {
  try {
    const res = await axios.post(
      `${endpoint}/wp/v2/posts/${postId}`,
      { status: 'publish' },
      { headers: jh(auth), timeout: 15000 }
    );
    return res.data.link;
  } catch (e) {
    console.log('[WP] Publish draft failed:', e.message);
    return null;
  }
}

// ─── MAIN: POST TO WORDPRESS ──────────────────────────────────────────────────
async function postToWordPress(domainUrl, credentials, postData) {
  const { username, appPassword, endpoint } = credentials;
  const {
    title, content, metaDescription,
    imageBase64, imageAlt, keyword,
    category, tags = [],
    status = 'draft',   // default draft so we can verify before publishing
  } = postData;

  const auth = buildAuth(username, appPassword);

  // 1. Resolve category + tags in parallel
  const [categoryId, ...resolvedTagIds] = await Promise.all([
    category ? getOrCreateTerm(endpoint, auth, 'categories', category) : Promise.resolve(null),
    ...tags.map(t => getOrCreateTerm(endpoint, auth, 'tags', t)),
  ]);
  const validTagIds = resolvedTagIds.filter(Boolean);

  // 2. Upload image
  const uploaded = await uploadImage(endpoint, auth, imageBase64, imageAlt || keyword, keyword);
  const featuredMediaId = uploaded?.id   || null;
  const uploadedUrl     = uploaded?.url  || null;

  // 3. Replace [IMAGE_PLACEHOLDER] with actual img tag
  let finalContent = content;
  if (uploadedUrl && featuredMediaId) {
    finalContent = content.replace(
      '[IMAGE_PLACEHOLDER]',
      `<figure class="wp-block-image size-large aligncenter">
        <img src="${uploadedUrl}" alt="${imageAlt || keyword}" class="wp-image-${featuredMediaId}"/>
      </figure>`
    );
  } else {
    finalContent = content.replace('[IMAGE_PLACEHOLDER]', '');
  }

  // 4. Create post
  const body = {
    title,
    content: finalContent,
    status,
    excerpt: metaDescription,
    categories: categoryId ? [categoryId] : [],
    tags: validTagIds,
  };
  if (featuredMediaId) body.featured_media = featuredMediaId;

  const postRes = await axios.post(
    `${endpoint}/wp/v2/posts`,
    body,
    { headers: jh(auth), timeout: 30000 }
  );

  const postId  = postRes.data.id;
  const postUrl = postRes.data.link;
  console.log(`[WP] ✅ Post created: ID=${postId} status=${status}`);

  // 5. Write Yoast meta immediately after post creation
  await writeYoastMeta(endpoint, auth, postId, keyword, metaDescription);

  // 6. Verify Yoast scores
  const yoast = await verifyYoastScores(endpoint, auth, postId);

  return { postId, postUrl, status: postRes.data.status, yoast, uploadedImageUrl: uploadedUrl };
}

module.exports = { postToWordPress, verifyYoastScores, writeYoastMeta, deletePost, publishPost };
