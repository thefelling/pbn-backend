const axios = require('axios');

const GITHUB_API = 'https://api.github.com';
const headers = {
  Authorization: `token ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
};

const owner = process.env.GITHUB_REPO_OWNER;
const repo = process.env.GITHUB_REPO_NAME;

async function readFile(filename) {
  try {
    const res = await axios.get(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${filename}`,
      { headers }
    );
    const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return { data: JSON.parse(content), sha: res.data.sha };
  } catch (err) {
    if (err.response?.status === 404) return { data: [], sha: null };
    throw err;
  }
}

async function writeFile(filename, data, sha = null) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const body = {
    message: `Update ${filename}`,
    content,
  };
  if (sha) body.sha = sha;

  await axios.put(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filename}`,
    body,
    { headers }
  );
}

module.exports = { readFile, writeFile };