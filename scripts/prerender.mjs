// Prerender the marketing routes to static HTML after `vite build`.
//
// Why: the site is a client-rendered React SPA, so crawlers and AI answer
// engines that do not run JavaScript receive an empty <div id="root">. This
// script serves the built dist/ locally, loads each marketing route in headless
// Chrome (letting React and the useSeo head tags run), and writes the finished
// HTML back into dist/<route>/index.html. Real visitors still get the full
// interactive app; non-JS clients now get real content and metadata.
//
// Scope: marketing routes only. The beta pages, admin console, unsubscribed
// page and the /api serverless functions are left completely untouched.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const PORT = 4319;

// Routes to prerender. Must match the client router in src/App.tsx.
// Excluded on purpose: /mockup (internal), /beta, /beta-treats, /admin,
// /unsubscribed (their own bundles / static files, kept as-is).
const ROUTES = [
  "/",
  "/treats",
  "/business",
  "/support",
  "/privacy",
  "/terms",
  "/delete-account",
  "/confirmed",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

// Static file server with SPA fallback: unknown paths serve the freshly built
// index.html so the client router can render the requested route.
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = join(DIST, urlPath);
      if (urlPath.endsWith("/")) filePath = join(filePath, "index.html");

      let servePath = filePath;
      const missing = !existsSync(servePath) || (await stat(servePath)).isDirectory();
      if (missing) {
        if (existsSync(`${filePath}.html`)) servePath = `${filePath}.html`;
        else servePath = join(DIST, "index.html"); // SPA fallback
      }
      const data = await readFile(servePath);
      res.setHeader("Content-Type", MIME[extname(servePath)] || "application/octet-stream");
      res.end(data);
    } catch {
      res.statusCode = 500;
      res.end("prerender static server error");
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

async function run() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error("dist/index.html not found. Run `vite build` before prerender.");
  }

  const server = await startServer();
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${PORT}${route}`, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      // Ensure the app has rendered and useSeo has run.
      await page.waitForSelector("#root > *", { timeout: 15000 });
      await page
        .waitForFunction(() => document.querySelector('link[rel="canonical"]'), { timeout: 15000 })
        .catch(() => {});

      const html = await page.content();
      const outDir = route === "/" ? DIST : join(DIST, route);
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, "index.html"), `<!doctype html>\n${html}`);
      await page.close();
      console.log(`prerendered ${route}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});
