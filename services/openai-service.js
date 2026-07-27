const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const writingStyles = [
  'conversational and friendly',
  'professional and authoritative',
  'casual and relatable',
  'educational and informative',
  'storytelling with examples',
];

const structureVariants = [
  ['H2', 'H3', 'H3', 'H2', 'H3', 'H2'],
  ['H2', 'H2', 'H3', 'H2', 'H3', 'H3', 'H2'],
  ['H2', 'H3', 'H2', 'H2', 'H3', 'H2'],
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomWordCount() {
  return Math.floor(Math.random() * (1500 - 800 + 1)) + 800;
}

async function generateArticle(keyword, extraInstructions = '') {
  const style = getRandomItem(writingStyles);
  const structure = getRandomItem(structureVariants);
  const wordCount = randomWordCount();

  const prompt = `
Write a ${wordCount}-word SEO-optimized blog article about: "${keyword}"

Requirements:
- Writing style: ${style}
- Include the keyword naturally in: title, first paragraph, at least 2 headings, throughout the body
- Structure: Title (H1), then use these heading levels: ${structure.join(', ')}
- Add a meta description of 150-160 characters at the TOP before the article, labeled as "META DESCRIPTION:"
- Include 1 outbound link naturally embedded in the text (use a real relevant URL)
- Make it feel 100% human-written — vary sentence length, use contractions, include opinions/personal tone
- Do NOT use phrases like "In conclusion", "To summarize", "As an AI"
- End with a call-to-action paragraph
- IMPORTANT: Return clean HTML formatting with proper heading tags
${extraInstructions}

Format your response EXACTLY like this:
META DESCRIPTION: [your meta description here]

<h1>[Article Title]</h1>
[rest of article in HTML]
`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
  });

  return completion.choices[0].message.content;
}

async function reviseArticle(article, keyword, feedback) {
  const prompt = `
Revise this article to improve SEO score. Issues to fix:
${feedback}

Keyword to optimize for: "${keyword}"

Original article:
${article}

Return the COMPLETE revised article in the same format (META DESCRIPTION + HTML).
`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });

  return completion.choices[0].message.content;
}

module.exports = { generateArticle, reviseArticle };