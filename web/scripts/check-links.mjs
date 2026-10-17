import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile('dist/index.html', 'utf8');
const urls = [
  ...new Set(
    [...html.matchAll(/href="(https:\/\/[^"#]+)(?:#[^"]*)?"/g)].map((match) =>
      match[1].replaceAll('&amp;', '&'),
    ),
  ),
];
const results = [];
for (const url of urls) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'Companion-website-link-check' },
  });
  results.push({ url, status: response.status });
  console.log(response.status, url);
}
await mkdir('reports', { recursive: true });
await writeFile('reports/links.json', JSON.stringify(results, null, 2));
assert(
  results.every((result) => result.status >= 200 && result.status < 400),
  'Some external destinations need review.',
);
