// Build-time content for the resources section. Both files are written by
// scripts/build-resources.mjs from approved content_pieces rows and bundled
// into this lazy chunk. Nothing here talks to the database at request time.
import resourcesJson from "../../data/generated/resources.json";
import manifestJson from "../../data/generated/guides-manifest.json";

export type GuideSummary = {
  town: string;
  slug: string;
  county: string;
  venueCount: number;
  summary: string;
};

export type Guide = GuideSummary & {
  id: string;
  title: string;
  district: string | null;
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
export const manifest: GuideSummary[] = manifestJson as unknown as GuideSummary[];
export const news: NewsPost[] = resources.news;
export const events: EventItem[] = resources.events;

export const guideBySlug = (slug: string) => guides.find((g) => g.slug === slug);
export const newsBySlug = (slug: string) => news.find((n) => n.slug === slug);

// Counties in display order, each with its guides. Only counties that have at
// least one published guide exist here, so no empty heading can ever render.
export function groupByCounty(list: GuideSummary[]) {
  const map = new Map<string, GuideSummary[]>();
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

export function formatDate(iso: string | null, withWeekday = false) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  const date = d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });
  if (!withWeekday) return date;
  return `${d.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long" })} ${date}`;
}
