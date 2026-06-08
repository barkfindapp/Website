/**
 * Captures filter + dog profile screens by screenshotting
 * just the #phone element — pixel-perfect, no background bleed.
 * Run: node scripts/capture-mockups.mjs
 */
import puppeteer from 'puppeteer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '../public');

const SCREENS = [
  { query: 'filter',     out: 'screen-filter.png'     },
  { query: 'dogprofile', out: 'screen-dogprofile.png' },
];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();

// Wide enough so the 391px-wide phone never clips
await page.setViewport({ width: 700, height: 1000, deviceScaleFactor: 2 });

for (const { query, out } of SCREENS) {
  await page.goto(`http://localhost:5174/mockup?screen=${query}`, {
    waitUntil: 'networkidle0',
    timeout: 15000,
  });

  // Wait for the dog avatar image to load (for dogprofile)
  await page.evaluate(() => {
    return Promise.all(
      Array.from(document.images).map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })
      )
    );
  });

  const el = await page.$('#phone');
  if (!el) throw new Error(`#phone not found on screen=${query}`);

  const outPath = `${OUT}/${out}`;
  await el.screenshot({ path: outPath, type: 'png' });
  console.log(`✓ ${out} → ${outPath}`);
}

await browser.close();
console.log('Done.');
