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
  "/creators", // shared by link: needs its own title and noindex in the HTML
  "/reset-password", // Supabase recovery landing: prerendered so it is 200 + noindex, rendered client-side from the URL token
  "/404", // written to dist/404.html: Vercel serves it with a 404 status for unknown URLs
];

// Discover section: the published pages listed by scripts/build-resources.mjs
// (/discover, /dog-friendly and each town guide, /news and each post, /events).
async function resourceRoutes() {
  const file = join(__dirname, "..", "src", "data", "generated", "resources.json");
  if (!existsSync(file)) return [];
  const { pages } = JSON.parse(await readFile(file, "utf8"));
  return pages.map((p) => p.path);
}

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

// Launch headless Chrome. On Vercel's Linux build container the full Puppeteer
// download is unreliable and missing system libraries, so use a Lambda-grade
// Chromium there. Locally, use the full Puppeteer that ships its own browser.
async function launchBrowser() {
  if (process.env.VERCEL) {
    const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

async function run() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error("dist/index.html not found. Run `vite build` before prerender.");
  }

  const server = await startServer();
  const browser = await launchBrowser();

  try {
    for (const route of [...ROUTES, ...(await resourceRoutes())]) {
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
      if (route === "/404") {
        await writeFile(join(DIST, "404.html"), `<!doctype html>\n${html}`);
      } else {
        const outDir = route === "/" ? DIST : join(DIST, route);
        await mkdir(outDir, { recursive: true });
        await writeFile(join(outDir, "index.html"), `<!doctype html>\n${html}`);
      }
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
