function checkSEO(articleHTML, keyword, metaDescription) {
  const kw = keyword.toLowerCase();
  const text = articleHTML.replace(/<[^>]+>/g, ' ').toLowerCase();
  const issues = [];
  let score = 0;

  // 1. Keyword in title (H1)
  const h1Match = articleHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const h1Text = h1Match ? h1Match[1].toLowerCase() : '';
  if (h1Text.includes(kw)) {
    score += 20;
  } else {
    issues.push(`Add keyword "${keyword}" to the H1 title (currently: "${h1Match?.[1] || 'none'}")`);
  }

  // 2. Keyword in meta description
  if (metaDescription && metaDescription.toLowerCase().includes(kw)) {
    score += 15;
  } else {
    issues.push(`Add keyword "${keyword}" to the meta description`);
  }

  // 3. Keyword in first paragraph
  const firstPara = articleHTML.match(/<p[^>]*>(.*?)<\/p>/i);
  const firstParaText = firstPara ? firstPara[1].toLowerCase() : '';
  if (firstParaText.includes(kw)) {
    score += 15;
  } else {
    issues.push(`Add keyword "${keyword}" naturally in the first paragraph`);
  }

  // 4. Keyword density (0.5% - 2.5%)
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const kwWords = kw.split(' ');
  let kwCount = 0;
  for (let i = 0; i <= words.length - kwWords.length; i++) {
    if (kwWords.every((w, j) => words[i + j] === w)) kwCount++;
  }
  const density = (kwCount / words.length) * 100;
  if (density >= 0.5 && density <= 2.5) {
    score += 20;
  } else if (density < 0.5) {
    issues.push(`Keyword density too low (${density.toFixed(2)}%). Use "${keyword}" more frequently.`);
  } else {
    issues.push(`Keyword density too high (${density.toFixed(2)}%). Reduce keyword repetition.`);
  }

  // 5. Outbound link
  const outboundLinks = articleHTML.match(/href="https?:\/\/[^"]+"/gi) || [];
  if (outboundLinks.length >= 1) {
    score += 10;
  } else {
    issues.push('Add at least 1 outbound link to a relevant external source');
  }

  // 6. Keyword in at least one H2
  const h2Matches = articleHTML.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
  const h2HasKw = h2Matches.some(h => h.toLowerCase().includes(kw));
  if (h2HasKw) {
    score += 10;
  } else {
    issues.push(`Include keyword "${keyword}" in at least one H2 heading`);
  }

  // 7. Readability - avg sentence length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const avgSentenceLength = sentences.reduce((a, s) => a + s.split(' ').length, 0) / sentences.length;
  if (avgSentenceLength <= 20) {
    score += 10;
  } else {
    issues.push(`Average sentence length is ${avgSentenceLength.toFixed(0)} words. Aim for under 20 words per sentence.`);
  }

  return {
    score: Math.min(score, 100),
    issues,
    density: density.toFixed(2),
    wordCount: words.length,
    kwCount,
  };
}

module.exports = { checkSEO };