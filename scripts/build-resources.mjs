// Build step for the Discover section (/discover, /dog-friendly, /news, /events).
//
// Runs before `vite build`. Reads approved content from Supabase ONCE, at build
// time, and writes two JSON files the React pages import:
//   src/data/generated/discover-manifest.json  small search manifest: guides
//                                              (town, county, count, summary),
//                                              events and news (title, type,
//                                              town, date)
//   src/data/generated/resources.json          rendered pages, routes, sitemap rows
// plus one licensed photo per town guide in public/guide-photos/ (see PHOTOS).
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

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { countyForDistrict, UNMAPPED_COUNTY } from "./county-map.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data", "generated");
const PHOTO_DIR = join(__dirname, "..", "public", "guide-photos");
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

// Words that would put a rating or a Mylo verdict on a card. Cards never carry
// those (they are the app's job), so a summary sentence containing one is skipped.
const NOT_ON_CARDS = /\b(paws?|mylo|google|rated|ratings?|stars?|verdicts?)\b|\d\.\d/i;

// First sentence of the first real paragraph, for summaries and meta descriptions.
// `cardSafe` moves on to the next sentence that carries no rating or verdict.
function summarise(md, max = 170, { cardSafe = false } = {}) {
  const paras = String(md || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#"));
  const sentences = paras
    .slice(0, 3)
    .flatMap((p) => stripMarkdown(p).match(/[^.?!]+[.?!]+(\s|$)|[^.?!]+$/g) || [])
    .map((x) => x.trim())
    .filter(Boolean);
  const sentence = (cardSafe ? sentences.find((x) => !NOT_ON_CARDS.test(x)) : sentences[0]) || "";
  if (sentence.length <= max) return sentence;
  return sentence.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

// Highlight chips come only from the guide's own section headings, through a
// fixed word list: a heading that matches nothing gives no chip. Outdoor
// highlights first, at most three.
const HIGHLIGHTS = [
  ["Beaches", /\b(beach(es)?|coast(al)?|seafront)\b/i],
  ["Woodland", /\b(woods?|woodland|forests?)\b/i],
  ["Parks", /\b(parks?|green spaces?)\b/i],
  ["Walks", /\b(walks?|trails?)\b/i],
  ["Pubs", /\b(pubs?|bars?|inns?)\b/i],
  ["Cafes", /\b(cafes?|cafés?|coffee|tea rooms?)\b/i],
  ["Restaurants", /\brestaurants?\b/i],
  ["Places to stay", /\b(staying|stay|accommodation|hotels?)\b/i],
];
function highlightsFrom(md) {
  const headings = (String(md || "").match(/^#{2,3}\s+.+$/gm) || [])
    .map((h) => h.replace(/^#+\s+/, ""))
    .filter((h) => !/what to know/i.test(h));
  return HIGHLIGHTS.filter(([, re]) => headings.some((h) => re.test(h))).map(([label]) => label).slice(0, 3);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayMonth(iso) {
  const m = String(iso || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : "";
}

// The teal restriction chip: built from approved location_restrictions rows,
// never paraphrased from guide text, and only when the guide itself cites that
// authority. Seasonal rules first, then year-round; bans before lead rules.
function ruleChip(rows, body, today) {
  const text = String(body || "");
  const usable = (rows || []).filter((r) => {
    if (!r.authority || !text.includes(r.authority)) return false;
    if (r.applies_annually === false && r.ends_on && isoDate(r.ends_on) < today) return false;
    return true;
  });
  if (!usable.length) return null;
  const groups = new Map();
  for (const r of usable) {
    const seasonal = Boolean(r.starts_on && r.ends_on);
    const key = [r.name, r.restriction_type, seasonal ? isoDate(r.starts_on).slice(5) : "", seasonal ? isoDate(r.ends_on).slice(5) : ""].join("|");
    if (!groups.has(key)) groups.set(key, { ...r, seasonal, rows: [] });
    groups.get(key).rows.push(r);
  }
  const score = (g) => (g.seasonal ? 0 : 2) + (g.restriction_type === "dogs_banned" ? 0 : 1);
  const best = [...groups.values()].sort((a, b) => score(a) - score(b) || b.rows.length - a.rows.length)[0];
  const verb = best.restriction_type === "dogs_banned" ? "no dogs" : "dogs on lead";
  const area = best.rows.length === 1 && best.area_description ? best.area_description.split(":")[0].trim() : null;
  const partial = best.rows.length > 1 || (area && /\barea\b/i.test(area));
  const label = partial ? `${best.name}: ${verb} in some areas` : `${area || best.name}: ${verb}`;
  const dates = best.seasonal ? `${partial ? "," : ""} ${dayMonth(isoDate(best.starts_on))} to ${dayMonth(isoDate(best.ends_on))}` : "";
  return { text: `${label}${dates}`, authority: best.authority, checked: isoDate(best.checked_on) };
}

const LICENCE_URLS = {
  "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
};

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

// PHOTOS: one licensed photo per town. Only Geograph images with both a licence
// and a credit recorded qualify; Google and venue-website images never do.
// Beaches and parks first, then the best-reviewed place.
const PHOTO_SQL = `
  SELECT DISTINCT ON (town) town, name, image_url, image_credit, image_credit_url, image_licence
  FROM (
    SELECT public.content_town_of(address) AS town, name, category, review_count,
           image_url, image_credit, image_credit_url, image_licence
    FROM public.locations
    WHERE image_source = 'geograph'
      AND image_url IS NOT NULL AND image_licence IS NOT NULL AND image_credit IS NOT NULL
      AND COALESCE(flagged, false) = false
  ) x
  WHERE town = ANY($1)
  ORDER BY town, (category IN ('beach','park')) DESC, review_count DESC NULLS LAST, name`;

const RULES_SQL = `
  SELECT public.content_town_of(l.address) AS town, l.name, r.restriction_type,
         r.area_description, r.starts_on, r.ends_on, r.applies_annually, r.authority, r.checked_on
  FROM public.location_restrictions r
  JOIN public.locations l ON l.id = r.location_id
  WHERE r.status = 'approved'
    AND r.restriction_type IN ('dogs_banned', 'lead_required')
    AND public.content_town_of(l.address) = ANY($1)`;

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
    const photoRows = towns.length ? (await client.query(PHOTO_SQL, [towns])).rows : [];
    const ruleRows = towns.length ? (await client.query(RULES_SQL, [towns])).rows : [];
    await client.query("COMMIT");
    const photos = Object.fromEntries(photoRows.map((r) => [r.town, r]));
    const rules = {};
    for (const r of ruleRows) (rules[r.town] ||= []).push(r);
    return { pieces, geo: geoFromRows(geoRows), photos, rules };
  } finally {
    await client.end().catch(() => {});
  }
}

// Fixture shape: { "pieces": [ content_pieces rows ],
//   "geo": { "<Town>": { "district": "BS23", "venues": 40, "lat": 51.3, "lng": -2.9 } },
//   "photos": { "<Town>": { name, image_url, image_credit, image_credit_url, image_licence } },
//   "rules": { "<Town>": [ { name, restriction_type, area_description, starts_on, ends_on, applies_annually, authority, checked_on } ] } }
// Rows are filtered exactly as the SQL would, so fixtures can hold drafts too.
async function readFromFixture(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  const pieces = (raw.pieces || [])
    .filter((p) => p.channel === "website_blog" && ["approved", "exported"].includes(p.status) && ["location_page", "news", "event"].includes(p.content_type))
    .map((p) => ({ meta: {}, ...p }));
  return { pieces, geo: raw.geo || {}, photos: raw.photos || {}, rules: raw.rules || {} };
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

function buildGuides(pieces, { geo, photos = {}, rules = {} }, today, warnings) {
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
      summary: summarise(p.body_md, 170, { cardSafe: true }),
      highlights: highlightsFrom(p.body_md),
      rule: ruleChip(rules[town], p.body_md, today),
      photoSource: photos[town] || null, // downloaded in main(); never shipped as a URL
      photo: null,
      approvedAt: p.approved_at ? new Date(p.approved_at).toISOString() : null,
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
        approvedAt: p.approved_at ? new Date(p.approved_at).toISOString() : null,
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

// Three tries with a short pause, so one network blip does not cost a town its photo.
async function fetchWithRetry(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

// Copies each guide's licensed photo into public/guide-photos/ at build time, so
// public pages never request anything from Supabase. Resized only, never
// cropped (the card frame does the fitting). A failed download is a warning and
// the card falls back to the plain brand style.
async function attachPhotos(guides, warnings) {
  await rm(PHOTO_DIR, { recursive: true, force: true });
  const withSource = guides.filter((g) => g.photoSource);
  if (!withSource.length) return;
  await mkdir(PHOTO_DIR, { recursive: true });
  const { default: sharp } = await import("sharp");
  for (const g of withSource) {
    const src = g.photoSource;
    try {
      const buf = await fetchWithRetry(src.image_url);
      const file = `${g.slug}.webp`;
      const info = await sharp(buf)
        .rotate()
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(join(PHOTO_DIR, file));
      g.photo = {
        src: `/guide-photos/${file}`,
        width: info.width,
        height: info.height,
        alt: `${src.name}, ${g.town}`,
        credit: src.image_credit,
        creditUrl: /^https?:\/\//i.test(src.image_credit_url || "") ? src.image_credit_url : null,
        licence: src.image_licence,
        licenceUrl: LICENCE_URLS[src.image_licence] || null,
      };
    } catch (err) {
      warnings.push(`photo for ${g.town} not used (${err?.message || err}); plain brand card instead`);
    }
  }
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
    data = { pieces: [], geo: {}, photos: {}, rules: {} };
  }

  const guides = buildGuides(data.pieces, data, today, warnings);
  await attachPhotos(guides, warnings);
  for (const g of guides) delete g.photoSource;
  const news = buildNews(data.pieces);
  const events = buildEvents(data.pieces, today, warnings);

  // Routes to prerender and list in the sitemap. Index pages only count as
  // pages once they have something on them; individual pages only exist for
  // published pieces.
  const pages = [{ path: "/discover", lastmod: today, changefreq: "weekly", priority: "0.7" }];
  if (guides.length) {
    pages.push({ path: "/dog-friendly", lastmod: today, changefreq: "weekly", priority: "0.8" });
    for (const g of guides) pages.push({ path: `/dog-friendly/${g.slug}`, lastmod: g.updated || today, changefreq: "monthly", priority: "0.8" });
  }
  if (news.length) {
    pages.push({ path: "/news", lastmod: today, changefreq: "weekly", priority: "0.6" });
    for (const n of news) pages.push({ path: `/news/${n.slug}`, lastmod: n.updated || n.date || today, changefreq: "monthly", priority: "0.6" });
  }
  if (events.length) pages.push({ path: "/events", lastmod: today, changefreq: "weekly", priority: "0.5" });

  // One search manifest for the Discover hub: guides, events and news.
  const manifest = {
    guides: guides.map(({ town, slug, county, venueCount, summary }) => ({ town, slug, county, venueCount, summary })),
    events: events.map(({ id, title, date, town, venueName }) => ({ id, title, date, town, venueName })),
    news: news.map(({ slug, title, date, pressRelease, summary }) => ({ slug, title, date, pressRelease, summary })),
  };
  const resources = { generatedAt: new Date().toISOString(), today, guides, news, events, pages };

  await mkdir(OUT_DIR, { recursive: true });
  await rm(join(OUT_DIR, "guides-manifest.json"), { force: true });
  await writeFile(join(OUT_DIR, "discover-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(OUT_DIR, "resources.json"), JSON.stringify(resources, null, 2) + "\n");

  for (const w of warnings) console.warn(`resources: warning: ${w}`);
  console.log(`resources: source ${source}; ${guides.length} guide(s), ${news.length} news, ${events.length} upcoming event(s), ${pages.length} page(s)`);
}

main().catch((err) => {
  console.error("resources: build failed:", err?.message || err);
  process.exit(1);
});
