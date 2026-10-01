// Adds the resources section's published URLs to dist/sitemap.xml.
//
// Runs after `vite build` (which copies public/sitemap.xml into dist/) and
// reads the page list written by scripts/build-resources.mjs, so the sitemap
// lists exactly the pages this build published: a piece moved back to
// needs_edit drops out of the sitemap on the next build along with its page.
// public/sitemap.xml itself is left untouched.
//
// Also writes dist/llms.txt: a plain-text pointer for AI tools to the Discover
// hub, the town guides and the method page, from the same published list.

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

  const { pages, guides = [], news = [] } = JSON.parse(await readFile(RESOURCES, "utf8"));
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

  const has = (path) => pages.some((p) => p.path === path);
  const line = (title, path, note) => `- [${title}](${SITE_URL}${path})${note ? `: ${note}` : ""}`;
  const llms = [
    "# BarkFind",
    "",
    "> BarkFind is a UK app for finding dog-friendly places: cafes, pubs, parks, beaches and more, with each venue's own dog policy and the local council's dog rules. The website's Discover section has free town guides, news and events.",
    "",
    "## Discover",
    "",
    line("Discover", "/discover", "dog-friendly town guides, news and events from BarkFind"),
    ...(has("/dog-friendly") ? [line("Dog-friendly town guides", "/dog-friendly", "every published town guide, grouped by county")] : []),
    ...(has("/dog-friendly/how-guides-are-made") ? [line("How our town guides are made", "/dog-friendly/how-guides-are-made", "sources, checks and how to report a mistake")] : []),
    ...(guides.length ? ["", "## Town guides", "", ...guides.map((g) => line(g.title, `/dog-friendly/${g.slug}`, g.description || g.summary))] : []),
    ...(news.length ? ["", "## News", "", ...news.map((n) => line(n.title, `/news/${n.slug}`, n.summary))] : []),
    "",
    "## About",
    "",
    line("BarkFind", "/", "the app"),
    line("Support", "/support"),
    line("Privacy policy", "/privacy"),
    "",
  ].join("\n");
  await writeFile(join(ROOT, "dist", "llms.txt"), llms);
  console.log(`resources: wrote dist/llms.txt (${guides.length} guide(s))`);
}

run().catch((err) => {
  console.error("resources sitemap failed:", err?.message || err);
  process.exit(1);
});
