import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Uses only the extension's built-in localhost demo; no real meeting data.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark',
  });
  await page.goto(process.env.PRODUCT_URL || 'http://localhost:5173');
  await page.getByRole('heading', { name: 'EXECUTIVE SUMMARY' }).waitFor();
  await page.locator('.transcript .entry').last().waitFor();
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.locator('.transcript').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await mkdir('src/assets', { recursive: true });
  await page.screenshot({ path: 'src/assets/extension.png' });
  await page.screenshot({
    path: 'src/assets/summary.png',
    clip: { x: 282, y: 430, width: 810, height: 520 },
  });
} finally {
  await browser.close();
}
