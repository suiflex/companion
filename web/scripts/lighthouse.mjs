import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { launch } from 'chrome-launcher';

const server = spawn('make', ['preview'], { stdio: 'ignore', detached: true });
let chrome;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      ready = (await fetch('http://127.0.0.1:4321')).ok;
    } catch {
      /* Wait for preview startup. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Production preview did not start.');
  chrome = await launch({
    chromeFlags: ['--headless', '--no-first-run', '--disable-gpu'],
  });
  await mkdir('reports', { recursive: true });
  const scores = [];
  for (const mode of ['mobile', 'desktop']) {
    const result = await lighthouse(
      'http://127.0.0.1:4321',
      {
        port: chrome.port,
        output: ['html', 'json'],
        onlyCategories: [
          'performance',
          'accessibility',
          'best-practices',
          'seo',
        ],
      },
      mode === 'desktop' ? desktopConfig : undefined,
    );
    if (!result || result.lhr.runtimeError)
      throw new Error(
        result?.lhr.runtimeError?.message || 'Lighthouse returned no result.',
      );
    await writeFile(`reports/lighthouse-${mode}.html`, result.report[0]);
    await writeFile(`reports/lighthouse-${mode}.json`, result.report[1]);
    const categories = Object.fromEntries(
      Object.entries(result.lhr.categories).map(([name, category]) => [
        name,
        Math.round(category.score * 100),
      ]),
    );
    scores.push({ mode, ...categories });
    console.log(mode, categories);
    if (Object.values(categories).some((score) => score < 95))
      process.exitCode = 1;
  }
  await writeFile(
    'reports/lighthouse-scores.json',
    JSON.stringify(scores, null, 2),
  );
} finally {
  chrome?.kill();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* Preview may already have exited. */
  }
}
