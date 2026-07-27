const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const writingStyles = [
  'conversational and thought-provoking, using rhetorical questions',
  'analytical and data-driven with specific real-world examples',
  'narrative storytelling with a case study as the opening hook',
  'educational and myth-busting with counterintuitive facts',
  'psychological deep-dive with references to research and studies',
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomWordCount() {
  return Math.floor(Math.random() * (1500 - 900 + 1)) + 900;
}

// Strip markdown artifacts from AI output
function stripMarkdown(text) {
  return text
    .replace(/```html\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^---\s*$/gm, '')
    .trim();
}

// STEP 1: Generate title, keyword, category, tags from niche
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

// STEP 2: Write full article from generated title + keyword
async function generateArticleFromTitle(title, keyword, niche) {
  const style = getRandomItem(writingStyles);
  const wordCount = randomWordCount();

  const prompt = `Write a ${wordCount}-word SEO-optimized blog article.

Article Title: "${title}"
Focus Keyword: "${keyword}"
Niche: "${niche}"
Writing Style: ${style}

STRICT OUTPUT FORMAT (follow exactly, no deviations):

Line 1: META DESCRIPTION: [150-160 character description containing the keyword naturally]

Then the article in clean HTML:

<h1>${title}</h1>
[IMAGE_PLACEHOLDER]
<p>[First paragraph — must contain keyword within first 100 words]</p>
[Continue with H2, H3 headings, paragraphs — proper HTML structure]

REQUIREMENTS:
- Output ONLY the META DESCRIPTION line + clean HTML. NO markdown. NO code blocks. NO backticks.
- Keyword must appear in: H1, first paragraph, at least 2 H2 headings, naturally throughout body
- Keyword density: 1.0%–2.0% (natural, not stuffed)
- Include 1 outbound link to a real authoritative source (embed naturally in text)
- Use varied sentence lengths (mix short punchy sentences with longer analytical ones)
- No clichés: avoid "In conclusion", "To summarize", "As an AI", "delve", "tapestry"
- End with a thought-provoking question or actionable insight
- Minimum 3 H2 sections, each with at least 1 H3 subsection`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.82,
  });

  return stripMarkdown(completion.choices[0].message.content);
}

// Revise article for SEO issues
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