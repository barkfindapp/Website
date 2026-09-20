// One-off image optimiser. Run manually (node scripts/optimize-images.mjs),
// not part of the build. Re-encodes the images the site actually ships so they
// weigh far less. PNG re-encoding here is lossless (identical pixels, better
// compression); only the oversized beta screenshots are downscaled.

import sharp from "sharp";
import { readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kb = (n) => `${Math.round(n / 1024)}KB`;

// Glob helper (node globSync is available in Node 22+).
function files(pattern) {
  return globSync(pattern, { cwd: ROOT }).map((p) => join(ROOT, p));
}

// Shipping images only (matches .vercelignore allowlist), plus the beta
// screenshots and the OG image. Raw drop-offs in public/media are not shipped.
const PNGS = [
  ...files("public/media/step-*.png"),
  ...files("public/media/hero-*.png"),
  ...files("public/media/showcase-*.png"),
  ...files("public/media/mylo-*.png"),
  ...files("public/onboarding-mockup-1.png"),
];
const JPGS = files("public/media/mylo-*.jpg");
// Oversized phone screenshots used on /beta: downscale then re-encode.
const SCREENS = files("public/screen-*.png");
const SCREEN_MAX_WIDTH = 760;

let saved = 0;

async function reencodePng(file, maxWidth) {
  if (!existsSync(file)) return;
  const before = (await stat(file)).size;
  let img = sharp(await readFile(file));
  if (maxWidth) {
    const meta = await img.metadata();
    if (meta.width && meta.width > maxWidth) img = img.resize({ width: maxWidth });
  }
  const out = await img.png({ compressionLevel: 9, effort: 10 }).toBuffer();
  if (out.length < before) {
    await writeFile(file, out);
    saved += before - out.length;
  }
  console.log(`${file.replace(ROOT + "/", "").padEnd(42)} ${kb(before)} -> ${kb(Math.min(out.length, before))}`);
}

async function reencodeJpg(file) {
  if (!existsSync(file)) return;
  const before = (await stat(file)).size;
  const out = await sharp(await readFile(file)).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (out.length < before) {
    await writeFile(file, out);
    saved += before - out.length;
  }
  console.log(`${file.replace(ROOT + "/", "").padEnd(42)} ${kb(before)} -> ${kb(Math.min(out.length, before))}`);
}

for (const f of PNGS) await reencodePng(f);
for (const f of SCREENS) await reencodePng(f, SCREEN_MAX_WIDTH);
for (const f of JPGS) await reencodeJpg(f);

console.log(`\nTotal saved: ${kb(saved)}`);
