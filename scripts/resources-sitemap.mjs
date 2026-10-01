// Adds the resources section's published URLs to dist/sitemap.xml.
//
// Runs after `vite build` (which copies public/sitemap.xml into dist/) and
// reads the page list written by scripts/build-resources.mjs, so the sitemap
// lists exactly the pages this build published: a piece moved back to
// needs_edit drops out of the sitemap on the next build along with its page.
// public/sitemap.xml itself is left untouched.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE_URL = "https://www.barkfind.com";
const SITEMAP = join(ROOT, "dist", "sitemap.xml");
const RESOURCES = join(ROOT, "src", "data", "generated", "resources.json");

async function run() {
  if (!existsSync(SITEMAP)) throw new Error("dist/sitemap.xml not found. Run `vite build` first.");
  if (!existsSync(RESOURCES)) throw new Error("resources.json not found. Run scripts/build-resources.mjs first.");

  const { pages } = JSON.parse(await readFile(RESOURCES, "utf8"));
  const xml = await readFile(SITEMAP, "utf8");
  const entries = pages
    .map(
      (p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    )
    .join("\n");
  const out = xml.replace(/\s*<\/urlset>\s*$/, `\n${entries}\n</urlset>\n`);
  await writeFile(SITEMAP, out);
  console.log(`resources: added ${pages.length} URL(s) to dist/sitemap.xml`);
}

run().catch((err) => {
  console.error("resources sitemap failed:", err?.message || err);
  process.exit(1);
});
