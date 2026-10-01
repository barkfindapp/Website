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
import { BLOCKED_PLACE_PHOTOS } from "./photo-blocklist.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data", "generated");
const PHOTO_DIR = join(__dirname, "..", "public", "guide-photos");
const PLACE_PHOTO_DIR = join(__dirname, "..", "public", "place-photos");
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
    if (r.restriction_type !== "dogs_banned" && r.restriction_type !== "lead_required") return false;
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

// Questions about dog rules on a guide page. Built only from approved
// location_restrictions rows whose authority the guide itself cites. Questions
// come from fixed patterns; answers are the approved summary text, word for
// word, plus the source. The FAQPage data uses exactly these strings.
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MONTH_FULL[Number(m[2]) - 1]} ${m[1]}` : "";
}
function coversSummer(r) {
  const s = isoDate(r.starts_on), e = isoDate(r.ends_on);
  return Boolean(s && e && s.slice(5) <= "06-01" && e.slice(5) >= "08-31");
}
function rulesFaq(rows, body, today, limit = 6) {
  const text = String(body || "");
  const usable = (rows || []).filter(
    (r) =>
      r.summary &&
      r.authority &&
      text.includes(r.authority) &&
      !(r.applies_annually === false && r.ends_on && isoDate(r.ends_on) < today)
  );
  const groups = new Map();
  for (const r of usable) {
    const seasonal = Boolean(r.starts_on && r.ends_on);
    const on = r.category === "beach" ? "on" : "at";
    let q;
    if (r.restriction_type === "dogs_banned" && seasonal && coversSummer(r)) q = `Can dogs go ${on} ${r.name} in summer?`;
    else if (r.restriction_type === "dogs_banned" && seasonal) q = `When are dogs banned ${on} ${r.name}?`;
    else if (r.restriction_type === "dogs_banned") q = `Are dogs allowed ${on} ${r.name}?`;
    else if (r.restriction_type === "lead_required") q = `Do dogs need to be on a lead ${on} ${r.name}?`;
    else if (r.restriction_type === "dogs_allowed") q = `Are dogs allowed ${on} ${r.name}?`;
    else continue;
    if (!groups.has(q)) groups.set(q, { q, rank: r.restriction_type === "dogs_banned" ? (seasonal ? 0 : 1) : r.restriction_type === "lead_required" ? 2 : 3, parts: new Map(), sources: new Map() });
    const g = groups.get(q);
    g.rank = Math.min(g.rank, r.restriction_type === "dogs_banned" ? (seasonal ? 0 : 1) : r.restriction_type === "lead_required" ? 2 : 3);
    // The same rule recorded twice ("at Brean Beach" / "on Brean Beach") appears once.
    const key = r.summary.toLowerCase().replace(/\b(at|on|in|the)\b/g, "").replace(/[^a-z0-9]+/g, "");
    if (![...g.parts.values()].includes(key)) g.parts.set(r.summary.trim(), key);
    const checked = isoDate(r.checked_on);
    g.sources.set(`${r.authority}|${checked || ""}`, { authority: r.authority, checked });
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.q.localeCompare(b.q, "en-GB"))
    .slice(0, limit)
    .map((g) => {
      const source = [...g.sources.values()]
        .map((x) => (x.checked ? `${x.authority}, checked ${longDate(x.checked)}` : x.authority))
        .join("; ");
      return { question: g.q, answer: `${[...g.parts.keys()].join(" ")} Source: ${source}.` };
    });
}

// Page title listing only what the guide covers, from its highlights (which
// come from its own headings). Falls back to the guide title.
function guideSeoTitle(town, title, highlights) {
  const list = (n) => {
    const items = highlights.slice(0, n).map((h) => h.toLowerCase());
    return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0];
  };
  for (const n of [3, 2, 1]) {
    if (highlights.length < n) continue;
    const t = `Dog-friendly ${town}: ${list(n)}`;
    if (`${t} | BarkFind`.length <= 65) return t;
  }
  return title || `Dog-friendly ${town}`;
}

// Meta description that always ends on a full sentence: the first card-safe
// sentence that fits, otherwise one built from the guide's highlights.
function guideDescription(md, town, highlights, max = 160) {
  const paras = String(md || "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith("#"));
  const sentences = paras
    .slice(0, 3)
    .flatMap((p) => stripMarkdown(p).match(/[^.?!]+[.?!]+(\s|$)/g) || [])
    .map((x) => x.trim())
    .filter((x) => x && !NOT_ON_CARDS.test(x));
  const fit = sentences.find((x) => x.length <= max && x.length >= 40);
  if (fit) return fit;
  const what = highlights.length ? highlights.slice(0, 3).map((h) => h.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1") : "places";
  return `Dog-friendly ${what} in ${town}, with local dog rules and where they come from.`;
}

// The method page lives beside the guides; no town guide may take its address.
export const METHOD_SLUG = "how-guides-are-made";

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
function makeMarked({ sponsored = false } = {}) {
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
  return marked;
}

const stripLeadingH1 = (md) => String(md || "").replace(/^\s*#\s+[^\n]*\n+/, "");

function renderMarkdown(md, opts) {
  return makeMarked(opts).parse(stripLeadingH1(md));
}

// The same rendering, split into top-level blocks (paragraphs, headings, lists)
// so teaser place cards can sit between them. The text itself is untouched.
function renderBlocks(md, opts) {
  const marked = makeMarked(opts);
  const tokens = marked.lexer(stripLeadingH1(md));
  return tokens
    .filter((t) => t.type !== "space")
    .map((t) => ({
      kind: t.type === "heading" ? "heading" : "text",
      html: marked.parser(Object.assign([t], { links: tokens.links })),
      text: t.type === "heading" ? "" : stripMarkdown(t.raw),
    }));
}

// ---------- teaser place cards ----------

const CATEGORY_LABELS = {
  cafe: "Cafe", pub: "Pub", bar: "Bar", restaurant: "Restaurant", park: "Park",
  beach: "Beach", "pet-store": "Pet shop", vet: "Vet", groomer: "Groomer",
};
const POLICY_LABELS = {
  welcome: "Dogs welcome",
  restricted: "Some dog restrictions",
  not_allowed: "Dogs not allowed",
};
const AMENITY_LABELS = {
  "dedicated-car-park": "Car park",
  "on-site-parking": "Parking",
  "off-lead-area": "Off-lead area",
  "indoor-dog-zone": "Indoor dog area",
  "dog-beds-mats": "Dog beds",
  "dedicated-dog-menu": "Dog menu",
  "drop-off-vet-bays": "Drop-off bays",
};
const amenityLabel = (slug) =>
  AMENITY_LABELS[slug] || String(slug).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

const GOOGLE_HOST = /(^|\.)(google|googleusercontent|gstatic|ggpht|googleapis|googlevideo|blogger|blogspot)\.[a-z.]+$/i;
const isHttpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || ""));
const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

// A clean street from the address: the first part that ends like a street name,
// without the house number. Plus codes, units and building names are dropped.
const STREET_END = /\b(Rd|Road|St|Street|Ln|Lane|Ave|Avenue|Way|Dr|Drive|Esplanade|Parade|Hill|Close|Cl|Gardens|Terrace|Place|Pl|Square|Sq|Row|Walk|Crescent|Cres|Grove|Green|Promenade|Quay|Wharf|Rise|Mews)\.?$/i;
function streetOf(address) {
  for (const raw of String(address || "").split(",")) {
    const part = raw.trim().replace(/^\d+[A-Za-z]?(-\d+[A-Za-z]?)?\s+/, "");
    if (!part || /\+/.test(part) || /\d/.test(part)) continue;
    if (STREET_END.test(part)) return part;
  }
  return null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Names a guide could use for a place: the full name, and the name without a
// trailing qualifier ("The Old Rectory - Brean" -> "The Old Rectory"). Each must
// be two or more words and not just a town name, so "Brean" or "Beach" never match.
function nameVariants(name, townNames) {
  const full = String(name || "").trim();
  const stripped = full.replace(/\s*(\s-\s|\s@\s?|\(|,\s).*$/, "").trim();
  return [...new Set([full, stripped])].filter((v) => {
    const words = v.split(/\s+/).filter(Boolean);
    return words.length >= 2 && /\p{L}/u.test(v) && v.length >= 5 && !townNames.has(v.toLowerCase());
  });
}

// Matches places to the guide's own text. Skips anything uncertain: a name two
// places share, or a mention that only appears inside a longer place name.
function matchPlaces(blocks, places, townNames, limit = 6) {
  const occ = [];
  for (const place of places) {
    for (const v of nameVariants(place.name, townNames)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v)}(?![\\p{L}\\p{N}])`, "giu");
      blocks.forEach((b, i) => {
        if (b.kind !== "text") return;
        for (const m of b.text.matchAll(re)) occ.push({ place, key: v.toLowerCase(), block: i, start: m.index, end: m.index + m[0].length });
      });
    }
  }
  // The same words claimed by two different places: not certain, drop them all.
  const owners = new Map();
  for (const o of occ) {
    if (!owners.has(o.key)) owners.set(o.key, new Set());
    owners.get(o.key).add(o.place.id);
  }
  const certain = occ.filter(
    (o) =>
      owners.get(o.key).size === 1 &&
      !occ.some((x) => x.place.id !== o.place.id && x.block === o.block && x.start <= o.start && x.end >= o.end && x.end - x.start > o.end - o.start)
  );
  const first = new Map();
  for (const o of certain) {
    const f = first.get(o.place.id);
    if (!f || o.block < f.block || (o.block === f.block && o.start < f.start)) first.set(o.place.id, o);
  }
  return [...first.values()].sort((a, b) => a.block - b.block || a.start - b.start).slice(0, limit);
}

function placeCard(place, after) {
  const website = isHttpUrl(place.website) ? place.website : null;
  const blocked = BLOCKED_PLACE_PHOTOS.has(place.id);
  let photo = null;
  if (!blocked && place.image_source === "geograph" && place.image_url && place.image_licence && place.image_credit) {
    photo = { kind: "geograph", sourceUrl: place.image_url, credit: place.image_credit, creditUrl: isHttpUrl(place.image_credit_url) ? place.image_credit_url : null, licence: place.image_licence, licenceUrl: LICENCE_URLS[place.image_licence] || null };
  } else if (!blocked && place.image_source === "website" && website && isHttpUrl(place.image_url) && /^https:/i.test(place.image_url) && !GOOGLE_HOST.test(hostOf(place.image_url))) {
    // Hotlinked, never copied; the page loads it with no referrer.
    photo = { kind: "website", src: place.image_url, credit: `${place.name} website`, creditUrl: website };
  }
  return {
    id: place.id,
    name: place.name,
    category: place.category || null,
    categoryLabel: CATEGORY_LABELS[place.category] || null,
    street: streetOf(place.address),
    policy: POLICY_LABELS[place.dog_policy] ? { kind: place.dog_policy, label: POLICY_LABELS[place.dog_policy] } : null,
    amenities: (place.amenities || []).slice(0, 3).map(amenityLabel),
    photo,
    after,
  };
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
  SELECT public.content_town_of(l.address) AS town, l.name, l.category, r.id, r.restriction_type,
         r.summary, r.area_description, r.starts_on, r.ends_on, r.applies_annually, r.authority, r.checked_on
  FROM public.location_restrictions r
  JOIN public.locations l ON l.id = r.location_id
  WHERE r.status = 'approved'
    AND r.restriction_type IN ('dogs_banned', 'lead_required', 'dogs_allowed')
    AND public.content_town_of(l.address) = ANY($1)`;

// Teaser card candidates: every place in a published guide's town except the
// ones the app hides (flagged = true: To review and Kept excluded).
const PLACES_SQL = `
  SELECT public.content_town_of(address) AS town, id, name, category, address,
         dog_policy, amenities, website,
         image_source, image_url, image_credit, image_credit_url, image_licence
  FROM public.locations
  WHERE COALESCE(flagged, false) = false
    AND address IS NOT NULL
    AND public.content_town_of(address) = ANY($1)`;

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
    const placeRows = towns.length ? (await client.query(PLACES_SQL, [towns])).rows : [];
    await client.query("COMMIT");
    const photos = Object.fromEntries(photoRows.map((r) => [r.town, r]));
    const rules = {};
    for (const r of ruleRows) (rules[r.town] ||= []).push(r);
    const places = {};
    for (const r of placeRows) (places[r.town] ||= []).push(r);
    return { pieces, geo: geoFromRows(geoRows), photos, rules, places };
  } finally {
    await client.end().catch(() => {});
  }
}

// Fixture shape: { "pieces": [ content_pieces rows ],
//   "geo": { "<Town>": { "district": "BS23", "venues": 40, "lat": 51.3, "lng": -2.9 } },
//   "photos": { "<Town>": { name, image_url, image_credit, image_credit_url, image_licence } },
//   "rules": { "<Town>": [ { name, restriction_type, area_description, starts_on, ends_on, applies_annually, authority, checked_on } ] },
//   "places": { "<Town>": [ { id, name, category, address, dog_policy, amenities, website, image_source, image_url, image_credit, image_credit_url, image_licence, flagged } ] } }
// Rows are filtered exactly as the SQL would, so fixtures can hold drafts too.
async function readFromFixture(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  const pieces = (raw.pieces || [])
    .filter((p) => p.channel === "website_blog" && ["approved", "exported"].includes(p.status) && ["location_page", "news", "event"].includes(p.content_type))
    .map((p) => ({ meta: {}, ...p }));
  const places = {};
  for (const [town, rows] of Object.entries(raw.places || {})) places[town] = rows.filter((r) => r.flagged !== true);
  return { pieces, geo: raw.geo || {}, photos: raw.photos || {}, rules: raw.rules || {}, places };
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

function buildGuides(pieces, { geo, photos = {}, rules = {}, places = {} }, today, warnings) {
  const townNames = new Set(Object.keys(geo).concat(pieces.map((p) => townFromRef(p.source_ref)).filter(Boolean)).map((t) => t.toLowerCase()));
  const bySlug = new Map();
  for (const p of pieces.filter((x) => x.content_type === "location_page")) {
    const town = townFromRef(p.source_ref);
    if (!town) {
      warnings.push(`guide ${p.id} has no "area:" source_ref, skipped`);
      continue;
    }
    const slug = slugify(town);
    if (slug === METHOD_SLUG) {
      warnings.push(`guide ${p.id} would take the method page's address, skipped`);
      continue;
    }
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
      seoTitle: guideSeoTitle(town, p.title, highlightsFrom(p.body_md)),
      description: guideDescription(p.body_md, town, highlightsFrom(p.body_md)),
      faq: rulesFaq(rules[town], p.body_md, today),
      publishedAt: isoDate(p.approved_at),
      rule: ruleChip(rules[town], p.body_md, today),
      photoSource: photos[town] || null, // downloaded in main(); never shipped as a URL
      photo: null,
      approvedAt: p.approved_at ? new Date(p.approved_at).toISOString() : null,
      // Never earlier than the published (approved) date.
      updated: [isoDate(p.updated_at), isoDate(p.approved_at)].filter(Boolean).sort().pop() || null,
      ...(() => {
        const blocks = renderBlocks(p.body_md);
        const matched = matchPlaces(blocks, places[town] || [], townNames);
        return {
          blocks: blocks.map(({ kind, html }) => ({ kind, html })),
          places: matched.map((m) => placeCard(m.place, m.block)),
        };
      })(),
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

// Geograph photos for teaser cards are copied in like guide photos. Website
// photos are never copied: they stay hotlinked. A failed copy falls back to the
// category tile.
async function attachPlacePhotos(guides, warnings) {
  await rm(PLACE_PHOTO_DIR, { recursive: true, force: true });
  const cards = guides.flatMap((g) => g.places).filter((c) => c.photo?.kind === "geograph");
  if (!cards.length) return;
  await mkdir(PLACE_PHOTO_DIR, { recursive: true });
  const { default: sharp } = await import("sharp");
  for (const c of cards) {
    try {
      const buf = await fetchWithRetry(c.photo.sourceUrl);
      const file = `${c.id}.webp`;
      const info = await sharp(buf).rotate().resize({ width: 600, withoutEnlargement: true }).webp({ quality: 76 }).toFile(join(PLACE_PHOTO_DIR, file));
      const { sourceUrl, ...rest } = c.photo;
      c.photo = { ...rest, src: `/place-photos/${file}`, width: info.width, height: info.height };
    } catch (err) {
      warnings.push(`place photo for ${c.name} not used (${err?.message || err}); category tile instead`);
      c.photo = null;
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
    data = { pieces: [], geo: {}, photos: {}, rules: {}, places: {} };
  }

  const guides = buildGuides(data.pieces, data, today, warnings);
  await attachPhotos(guides, warnings);
  await attachPlacePhotos(guides, warnings);
  for (const g of guides) delete g.photoSource;
  const news = buildNews(data.pieces);
  const events = buildEvents(data.pieces, today, warnings);

  // Routes to prerender and list in the sitemap. Index pages only count as
  // pages once they have something on them; individual pages only exist for
  // published pieces.
  const pages = [{ path: "/discover", lastmod: today, changefreq: "weekly", priority: "0.7" }];
  if (guides.length) {
    pages.push({ path: "/dog-friendly", lastmod: today, changefreq: "weekly", priority: "0.8" });
    pages.push({ path: `/dog-friendly/${METHOD_SLUG}`, lastmod: today, changefreq: "monthly", priority: "0.4" });
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
