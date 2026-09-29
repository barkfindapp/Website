// Build step for the resources section (/resources, /dog-friendly, /news, /events).
//
// Runs before `vite build`. Reads approved content from Supabase ONCE, at build
// time, and writes two JSON files the React pages import:
//   src/data/generated/guides-manifest.json  small search manifest (town, slug,
//                                            county, venue count, summary)
//   src/data/generated/resources.json        rendered pages, routes, sitemap rows
// No public page ever talks to the database: the site ships these files only.
//
// Editorial gate: only channel = 'website_blog' rows with status 'approved' or
// 'exported' are read. Anything else (draft, needs_edit) produces no page, no
// sitemap entry and no link. The build is read-only and writes nothing back;
// marking a piece exported stays a human step in the admin queue.
//
// Data source, in order:
//   RESOURCES_FIXTURE=path.json  local testing without touching the database
//   SUPABASE_DB_URL              the real read (server side only, never bundled)
//   neither                      empty section with a warning, except on a
//                                Vercel production build, which fails instead
// A database error fails the build, so a blip can never publish an empty
// section over a good one: the previous deploy simply stays live.
//
// County labels come from scripts/county-map.mjs (see the note there).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { countyForDistrict, UNMAPPED_COUNTY } from "./county-map.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data", "generated");
const TIME_ZONE = "Europe/London";

// ---------- helpers ----------

function slugify(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Today's date in the UK, as YYYY-MM-DD, so "has this event passed" matches
// what a visitor in the UK would expect regardless of the build machine's zone.
function ukToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isoDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(v);
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(v);
  return isNaN(d) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function stripMarkdown(s) {
  return String(s || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// First sentence of the first real paragraph, for summaries and meta descriptions.
function summarise(md, max = 170) {
  const para = String(md || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#"));
  const text = stripMarkdown(para || "");
  const sentence = (text.match(/^.+?[.?!](\s|$)/) || [text])[0].trim();
  if (sentence.length <= max) return sentence;
  return sentence.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

// Markdown -> HTML. Raw HTML in the source is escaped, never passed through, and
// a leading H1 is dropped because the page template already renders the title.
// External links open normally; `sponsored` (phase 3) marks them rel="sponsored".
function renderMarkdown(md, { sponsored = false } = {}) {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      html({ text }) {
        return escapeHtml(text);
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safeHref = /^(https?:|mailto:|\/|#)/i.test(href || "") ? href : "#";
        const external = /^https?:\/\//i.test(safeHref) && !/^https?:\/\/(www\.)?barkfind\.com/i.test(safeHref);
        const rel = external ? ` rel="${sponsored ? "sponsored noopener" : "noopener"}"` : "";
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(safeHref)}"${t}${rel}>${text}</a>`;
      },
    },
  });
  const body = String(md || "").replace(/^\s*#\s+[^\n]*\n+/, "");
  return marked.parse(body);
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- data sources ----------

const PIECES_SQL = `
  SELECT id, content_type, source_ref, title, body_md, status, meta,
         approved_at, created_at, updated_at
  FROM public.content_pieces
  WHERE channel = 'website_blog'
    AND status IN ('approved', 'exported')
    AND content_type IN ('location_page', 'news', 'event')
  ORDER BY approved_at DESC NULLS LAST, created_at DESC`;

// Per town, by postcode district: venues in the data, venues that pass the
// content engine's quality bar (same test as content_location_page_stats), and a
// centroid. Uses the engine's own town/district functions so towns line up.
const GEO_SQL = `
  WITH t AS (
    SELECT public.content_town_of(address) AS town,
           public.content_outward_district(address) AS district,
           (opening_hours IS NOT NULL AND mylo_verdict IS NOT NULL
            AND category IN ('pub','cafe','park','beach','restaurant','bar')) AS ok,
           latitude, longitude
    FROM public.locations
    WHERE address IS NOT NULL
  )
  SELECT town, district, count(*)::int AS n,
         count(*) FILTER (WHERE ok)::int AS eligible,
         avg(latitude) AS lat, avg(longitude) AS lng
  FROM t
  WHERE town = ANY($1) AND district IS NOT NULL
  GROUP BY town, district`;

async function readFromDatabase(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // Read-only transaction: this build cannot write to the database even by mistake.
    await client.query("BEGIN READ ONLY");
    const pieces = (await client.query(PIECES_SQL)).rows;
    const towns = [...new Set(pieces.filter((p) => p.content_type === "location_page").map((p) => townFromRef(p.source_ref)).filter(Boolean))];
    const geoRows = towns.length ? (await client.query(GEO_SQL, [towns])).rows : [];
    await client.query("COMMIT");
    return { pieces, geo: geoFromRows(geoRows) };
  } finally {
    await client.end().catch(() => {});
  }
}

// Fixture shape: { "pieces": [ content_pieces rows ], "geo": { "<Town>": { "district": "BS23", "venues": 40, "lat": 51.3, "lng": -2.9 } } }
// Rows are filtered exactly as the SQL would, so fixtures can hold drafts too.
async function readFromFixture(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  const pieces = (raw.pieces || [])
    .filter((p) => p.channel === "website_blog" && ["approved", "exported"].includes(p.status) && ["location_page", "news", "event"].includes(p.content_type))
    .map((p) => ({ meta: {}, ...p }));
  return { pieces, geo: raw.geo || {} };
}

function geoFromRows(rows) {
  const byTown = {};
  for (const r of rows) {
    const g = (byTown[r.town] ||= { districts: {}, venues: 0, latSum: 0, lngSum: 0, weight: 0 });
    g.districts[r.district] = (g.districts[r.district] || 0) + r.n;
    g.venues += r.eligible || 0;
    if (r.lat != null && r.lng != null) {
      g.latSum += Number(r.lat) * r.n;
      g.lngSum += Number(r.lng) * r.n;
      g.weight += r.n;
    }
  }
  const out = {};
  for (const [town, g] of Object.entries(byTown)) {
    const district = Object.entries(g.districts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    out[town] = { district, venues: g.venues, lat: g.weight ? g.latSum / g.weight : null, lng: g.weight ? g.lngSum / g.weight : null };
  }
  return out;
}

function townFromRef(ref) {
  const m = String(ref || "").match(/^area:(.+)$/);
  return m ? m[1].trim() : null;
}

// ---------- build ----------

function buildGuides(pieces, geo, warnings) {
  const bySlug = new Map();
  for (const p of pieces.filter((x) => x.content_type === "location_page")) {
    const town = townFromRef(p.source_ref);
    if (!town) {
      warnings.push(`guide ${p.id} has no "area:" source_ref, skipped`);
      continue;
    }
    const slug = slugify(town);
    if (bySlug.has(slug)) {
      warnings.push(`two published guides for ${town}; using the most recently approved`);
      continue; // rows arrive newest-approved first
    }
    const g = geo[town] || {};
    let county = countyForDistrict(g.district);
    if (!county) {
      warnings.push(`no county for ${town} (district ${g.district || "unknown"}); add it to scripts/county-map.mjs`);
      county = UNMAPPED_COUNTY;
    }
    bySlug.set(slug, {
      id: p.id,
      slug,
      town,
      title: p.title || `Dog-friendly ${town}`,
      county,
      district: g.district || null,
      lat: g.lat ?? null,
      lng: g.lng ?? null,
      venueCount: Number(g.venues) || 0, // venues passing the quality bar in this town
      summary: summarise(p.body_md),
      updated: isoDate(p.updated_at) || isoDate(p.approved_at),
      html: renderMarkdown(p.body_md),
    });
  }

  const guides = [...bySlug.values()].sort((a, b) => a.town.localeCompare(b.town, "en-GB"));
  // Nearby guides: nearest by venue centroid; without coordinates, same county.
  for (const g of guides) {
    const others = guides.filter((o) => o.slug !== g.slug);
    const ranked =
      g.lat != null
        ? others.filter((o) => o.lat != null).sort((a, b) => haversineKm(g, a) - haversineKm(g, b))
        : others.filter((o) => o.county === g.county);
    g.nearby = ranked.slice(0, 3).map((o) => o.slug);
  }
  return guides;
}

function buildNews(pieces) {
  const used = new Set();
  return pieces
    .filter((p) => p.content_type === "news")
    .map((p) => {
      let slug = slugify(p.title) || String(p.id).slice(0, 8);
      if (used.has(slug)) slug = `${slug}-${String(p.id).slice(0, 6)}`;
      used.add(slug);
      const meta = p.meta || {};
      return {
        id: p.id,
        slug,
        title: p.title || "Untitled",
        date: isoDate(meta.published_date) || isoDate(p.approved_at) || isoDate(p.created_at),
        pressRelease: meta.press_release === true,
        summary: summarise(p.body_md),
        updated: isoDate(p.updated_at),
        html: renderMarkdown(p.body_md),
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function buildEvents(pieces, today, warnings) {
  return pieces
    .filter((p) => p.content_type === "event")
    .map((p) => {
      const meta = p.meta || {};
      const date = isoDate(meta.event_date);
      if (!date) {
        warnings.push(`event "${p.title}" has no meta.event_date, skipped`);
        return null;
      }
      if (date < today) return null; // past events drop out at build
      const source = typeof meta.source_url === "string" && /^https?:\/\//i.test(meta.source_url) ? meta.source_url : null;
      return {
        id: p.id,
        title: p.title || "Untitled event",
        date,
        town: meta.town || null,
        venueName: meta.venue_name || null,
        sourceUrl: source,
        summary: summarise(p.body_md, 300),
        html: renderMarkdown(p.body_md),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const warnings = [];
  const today = ukToday();
  let source;
  let data;

  if (process.env.RESOURCES_FIXTURE) {
    source = `fixture ${process.env.RESOURCES_FIXTURE}`;
    data = await readFromFixture(process.env.RESOURCES_FIXTURE);
  } else if (process.env.SUPABASE_DB_URL) {
    source = "database";
    data = await readFromDatabase(process.env.SUPABASE_DB_URL);
  } else if (process.env.VERCEL_ENV === "production") {
    throw new Error("SUPABASE_DB_URL is not set for this production build; refusing to publish an empty resources section.");
  } else {
    source = "none (SUPABASE_DB_URL not set)";
    warnings.push("SUPABASE_DB_URL is not set: building the resources section with no content");
    data = { pieces: [], geo: {} };
  }

  const guides = buildGuides(data.pieces, data.geo, warnings);
  const news = buildNews(data.pieces);
  const events = buildEvents(data.pieces, today, warnings);

  // Routes to prerender and list in the sitemap. Index pages only count as
  // pages once they have something on them; individual pages only exist for
  // published pieces.
  const pages = [{ path: "/resources", lastmod: today, changefreq: "weekly", priority: "0.7" }];
  if (guides.length) {
    pages.push({ path: "/dog-friendly", lastmod: today, changefreq: "weekly", priority: "0.8" });
    for (const g of guides) pages.push({ path: `/dog-friendly/${g.slug}`, lastmod: g.updated || today, changefreq: "monthly", priority: "0.8" });
  }
  if (news.length) {
    pages.push({ path: "/news", lastmod: today, changefreq: "weekly", priority: "0.6" });
    for (const n of news) pages.push({ path: `/news/${n.slug}`, lastmod: n.updated || n.date || today, changefreq: "monthly", priority: "0.6" });
  }
  if (events.length) pages.push({ path: "/events", lastmod: today, changefreq: "weekly", priority: "0.5" });

  const manifest = guides.map(({ town, slug, county, venueCount, summary }) => ({ town, slug, county, venueCount, summary }));
  const resources = { generatedAt: new Date().toISOString(), today, guides, news, events, pages };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "guides-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(OUT_DIR, "resources.json"), JSON.stringify(resources, null, 2) + "\n");

  for (const w of warnings) console.warn(`resources: warning: ${w}`);
  console.log(`resources: source ${source}; ${guides.length} guide(s), ${news.length} news, ${events.length} upcoming event(s), ${pages.length} page(s)`);
}

main().catch((err) => {
  console.error("resources: build failed:", err?.message || err);
  process.exit(1);
});
