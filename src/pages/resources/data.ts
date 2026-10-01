// Build-time content for the resources section. Both files are written by
// scripts/build-resources.mjs from approved content_pieces rows and bundled
// into this lazy chunk. Nothing here talks to the database at request time.
import resourcesJson from "../../data/generated/resources.json";
import manifestJson from "../../data/generated/discover-manifest.json";

export type GuideSummary = {
  town: string;
  slug: string;
  county: string;
  venueCount: number;
  summary: string;
};

// Licensed photo copied in at build time. Credit and licence always present.
export type GuidePhoto = {
  src: string;
  width: number;
  height: number;
  alt: string;
  credit: string;
  creditUrl: string | null;
  licence: string;
  licenceUrl: string | null;
};

export type Guide = GuideSummary & {
  id: string;
  title: string;
  district: string | null;
  highlights: string[];
  rule: { text: string; authority: string; checked: string | null } | null;
  photo: GuidePhoto | null;
  approvedAt: string | null;
  updated: string | null;
  html: string;
  nearby: string[];
};

export type NewsPost = {
  id: string;
  slug: string;
  title: string;
  date: string | null;
  pressRelease: boolean;
  approvedAt: string | null;
  summary: string;
  html: string;
};

export type EventItem = {
  id: string;
  title: string;
  date: string;
  town: string | null;
  venueName: string | null;
  sourceUrl: string | null;
  summary: string;
  html: string;
};

type Resources = {
  generatedAt: string;
  today: string;
  guides: Guide[];
  news: NewsPost[];
  events: EventItem[];
};

const resources = resourcesJson as unknown as Resources;

export const guides: Guide[] = resources.guides;
type Manifest = {
  guides: GuideSummary[];
  events: Pick<EventItem, "id" | "title" | "date" | "town" | "venueName">[];
  news: Pick<NewsPost, "slug" | "title" | "date" | "pressRelease" | "summary">[];
};
// One build-time manifest for the hub's search: guides, events and news.
export const searchManifest = manifestJson as unknown as Manifest;
export const manifest: GuideSummary[] = searchManifest.guides;
export const news: NewsPost[] = resources.news;
export const events: EventItem[] = resources.events;

export const guideBySlug = (slug: string) => guides.find((g) => g.slug === slug);
export const newsBySlug = (slug: string) => news.find((n) => n.slug === slug);

// Counties in display order, each with its guides. Only counties that have at
// least one published guide exist here, so no empty heading can ever render.
export function groupByCounty<T extends GuideSummary>(list: T[]) {
  const map = new Map<string, T[]>();
  for (const g of list) {
    if (!map.has(g.county)) map.set(g.county, []);
    map.get(g.county)!.push(g);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === "Other areas" ? 1 : b === "Other areas" ? -1 : a.localeCompare(b, "en-GB")))
    .map(([county, items]) => ({ county, items: items.sort((a, b) => a.town.localeCompare(b.town, "en-GB")) }));
}

export function matchesTown(g: GuideSummary, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return g.town.toLowerCase().includes(q) || g.county.toLowerCase().includes(q);
}

const q = (s: string | null | undefined, query: string) => Boolean(s && s.toLowerCase().includes(query));

export function searchAll(query: string) {
  const t = query.trim().toLowerCase();
  if (!t) return { guides: [], events: [], news: [] };
  return {
    guides: searchManifest.guides.filter((g) => q(g.town, t) || q(g.county, t)),
    events: searchManifest.events.filter((e) => q(e.title, t) || q(e.town, t) || q(e.venueName, t)),
    news: searchManifest.news.filter((n) => q(n.title, t) || q(n.summary, t)),
  };
}

// Date badge parts for event cards, e.g. { day: "SAT", date: "18", month: "OCT" }.
export function dateParts(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { timeZone: "Europe/London", ...o });
  return {
    day: part({ weekday: "short" }).slice(0, 3).toUpperCase(),
    date: part({ day: "numeric" }),
    month: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getUTCMonth()],
  };
}

export function formatDate(iso: string | null, withWeekday = false) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  const date = d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });
  if (!withWeekday) return date;
  return `${d.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long" })} ${date}`;
}
