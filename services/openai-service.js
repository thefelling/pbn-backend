const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const writingStyles = [
  'conversational and thought-provoking, using rhetorical questions and relatable analogies',
  'analytical and data-driven with specific real-world examples and case studies',
  'narrative storytelling with a compelling opening hook, then unfolding facts',
  'educational and myth-busting with counterintuitive facts that surprise the reader',
  'psychological deep-dive with references to research, but explained in simple terms',
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomWordCount() {
  return Math.floor(Math.random() * (1500 - 900 + 1)) + 900;
}

function stripMarkdown(text) {
  return text
    .replace(/```html\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^---\s*$/gm, '')
    .trim();
}

async function generateMetaFromNiche(niche) {
  const prompt = `You are an expert SEO content strategist. Generate a compelling article concept for this niche: "${niche}"

The title MUST follow this EXACT pattern:
"The [Specific Named Concept/Effect/Phenomenon]: [Explanatory Subtitle starting with Why/How/What]"

Study these examples carefully and match the style:
- "The Near-Miss Effect: Why the Human Brain Interprets Failure as Progress"
- "The Skinner Box Legacy: How Operant Conditioning Shaped Modern Slot Mechanics"
- "The Evolution of Risk: From Ancient Divination to Digital Odds"
- "The Availability Heuristic: Why We Overestimate Unlikely Events"
- "The House Edge Illusion: How Casinos Turn Mathematics Into Mythology"
- "The Gambler's Fallacy: Why the Brain Sees Patterns in Pure Randomness"

Rules:
- [Specific Concept] = a named psychological effect, scientific principle, historical legacy, or specific real phenomenon
- Subtitle = intellectually stimulating, reveals what the reader will learn
- Keyword = 2-4 word focus phrase directly related to the title concept
- Category = ONE specific category matching the niche (not "Uncategorized")
- Tags = 5 specific descriptive tags (specific enough to be meaningful, not too broad)

Respond ONLY in valid JSON, no other text:
{
  "title": "The [Concept]: [Subtitle]",
  "keyword": "2-4 word focus keyword",
  "category": "Specific Category Name",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(completion.choices[0].message.content);
}

async function generateArticleFromTitle(title, keyword, niche) {
  const style = getRandomItem(writingStyles);
  const wordCount = randomWordCount();

  const prompt = `Write a ${wordCount}-word SEO-optimized blog article that reads as if written by a skilled human writer, not an AI.

Article Title: "${title}"
Focus Keyword: "${keyword}"
Niche: "${niche}"
Writing Style: ${style}

CRITICAL INSTRUCTIONS:
- Write in a natural, conversational tone. Vary sentence length – but keep average sentence length under 20 words (aim for 12–18 words per sentence).
- Avoid clichés like "In conclusion", "To summarize", "As an AI", "delve", "tapestry", "in today's world".
- Use rhetorical questions, real-world examples, and occasional opinion or speculation.
- Make it engaging: start with a hook, then explain the concept, and end with a thought-provoking question or actionable takeaway.
- Insert the keyword naturally – don't stuff it. Aim for 1.0–2.0% density.
- Include 1 outbound link to a real authoritative source (e.g., Wikipedia, research paper) embedded naturally.

🔴 SEO REQUIREMENTS (must be fulfilled to avoid Yoast warnings):
- The focus keyword "${keyword}" MUST appear in at least one H2 heading (not just in H1 or body).
- Use short sentences as instructed above.

STRICT OUTPUT FORMAT (follow exactly):
Line 1: META DESCRIPTION: [150-160 character description containing the keyword naturally]

Then the article in clean HTML:
<h1>${title}</h1>
[IMAGE_PLACEHOLDER]
<p>[First paragraph — must contain keyword within first 100 words]</p>
[Continue with H2, H3 headings, paragraphs — proper HTML structure]

- Output ONLY the META DESCRIPTION line + clean HTML. NO markdown. NO code blocks. NO backticks.
- Minimum 3 H2 sections, each with at least 1 H3 subsection.
- Use bullet lists or numbered lists where appropriate.`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.82,
  });

  return stripMarkdown(completion.choices[0].message.content);
}

async function reviseArticle(article, keyword, feedback) {
  const prompt = `Revise this article to fix these specific SEO issues:
${feedback}

Focus keyword: "${keyword}"

CRITICAL: Return the COMPLETE revised article in EXACT same format:
- Line 1: META DESCRIPTION: [description]
- Then clean HTML article (NO markdown, NO code blocks)
- Do NOT truncate or summarize — return the FULL article

Original article:
${article}`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });

  return stripMarkdown(completion.choices[0].message.content);
}

module.exports = {
  generateMetaFromNiche,
  generateArticleFromTitle,
  reviseArticle,
  stripMarkdown,
};