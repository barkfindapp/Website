import { useMemo, useState } from "react";
import PageShell, { Section } from "../../components/PageShell";
import NotFound from "../NotFound";
import { SITE_URL, breadcrumbSchema, faqSchema, useSeo } from "../../lib/seo";
import {
  events,
  formatDate,
  groupByCounty,
  guideBySlug,
  guides,
  matchesTown,
  news,
  newsBySlug,
  searchAll,
  slug,
  type EventItem,
  type Guide,
  type NewsPost,
} from "./data";
import {
  BrandBlock,
  Breadcrumbs,
  DownloadCta,
  EventCard,
  EventRow,
  GuideCard,
  ListingCard,
  NewsCard,
  PhotoCredit,
  PlaceCard,
  Prose,
  TownSearch,
  placesLabel,
  plural,
  type Crumb,
} from "./parts";

// Router for the Discover section. Every page here renders from build-time
// JSON (see ./data.ts). A path with no published piece behind it falls through
// to the homepage, exactly like any other unknown URL: no stubs, no
// "coming soon" pages.

const HOME: Crumb = { name: "Home", path: "/" };
const DISCOVER: Crumb = { name: "Discover", path: "/discover" };
const GUIDES: Crumb = { name: "Dog-friendly guides", path: "/dog-friendly" };
const NEWS: Crumb = { name: "News", path: "/news" };
const EVENTS: Crumb = { name: "Events", path: "/events" };

const WIDE = "max-w-6xl";
const SEE_ALL = "font-semibold text-[#B74217] hover:underline";

// Must match METHOD_SLUG in scripts/build-resources.mjs.
const METHOD_PATH = "/dog-friendly/how-guides-are-made";
const DISCOVER_IMAGE = "/og-discover.png";

// Anything without a published page behind it is a 404, matching the server.
export default function ResourcesRoutes({ path }: { path: string }) {
  if (path === "/discover") return <DiscoverHub />;
  if (path === "/dog-friendly") return guides.length ? <GuideIndex /> : <NotFound />;
  if (path === METHOD_PATH) return guides.length ? <MethodPage /> : <NotFound />;
  if (path.startsWith("/dog-friendly/")) {
    const guide = guideBySlug(path.slice("/dog-friendly/".length));
    return guide ? <GuidePage guide={guide} /> : <NotFound />;
  }
  if (path === "/news") return news.length ? <NewsIndex /> : <NotFound />;
  if (path.startsWith("/news/")) {
    const post = newsBySlug(path.slice("/news/".length));
    return post ? <NewsPage post={post} /> : <NotFound />;
  }
  if (path === "/events") return events.length ? <EventsPage /> : <NotFound />;
  return <NotFound />;
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">{children}</ul>;
}

function GuidesByCounty({ list }: { list: Guide[] }) {
  return (
    <>
      {groupByCounty(list).map(({ county, items }) => (
        <div key={county} className="mt-6 first:mt-0">
          <h3 className="mb-3 text-sm font-extrabold uppercase tracking-[0.06em] text-[#6b6b6b]">{county}</h3>
          <CardGrid>
            {items.map((g) => (
              <li key={g.slug}>
                <GuideCard guide={g} />
              </li>
            ))}
          </CardGrid>
        </div>
      ))}
    </>
  );
}

// ─── Guide filters (area and highlights) ─────────────────────────────────────
// Two chip rows over the town guides, shown only once there are 4 or more
// approved guides. Area comes from the county mapping, highlights from the
// guide highlight word list. Choices live in the URL (?area=, ?highlight=).

const FILTERS_FROM = 4;
const HIGHLIGHT_ORDER = ["Beaches", "Woodland", "Parks", "Walks", "Pubs", "Cafes", "Restaurants", "Places to stay"];

function readParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

function writeParam(name: string, value: string) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(name, value);
    else params.delete(name);
    const q = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  } catch {
    /* the filter still works without the URL */
  }
}

function useGuideFilters() {
  const enabled = guides.length >= FILTERS_FROM;
  const areas = groupByCounty(guides).map((g) => g.county);
  const highlights = HIGHLIGHT_ORDER.filter((h) => guides.some((g) => g.highlights.includes(h)));
  const valid = (v: string, list: string[]) => (enabled && list.some((x) => slug(x) === v) ? v : "");
  const [area, setArea] = useState(() => valid(readParam("area"), areas));
  const [highlight, setHighlight] = useState(() => valid(readParam("highlight"), highlights));
  const list = guides.filter(
    (g) => (!area || slug(g.county) === area) && (!highlight || g.highlights.some((h) => slug(h) === highlight))
  );
  return {
    enabled,
    list,
    rows: enabled ? (
      <GuideFilterRows
        areas={areas}
        highlights={highlights}
        area={area}
        highlight={highlight}
        onArea={(v) => {
          setArea(v);
          writeParam("area", v);
        }}
        onHighlight={(v) => {
          setHighlight(v);
          writeParam("highlight", v);
        }}
      />
    ) : null,
  };
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1 text-sm font-bold transition ${
        active ? "border-[#B74217] bg-[#B74217] text-white" : "border-[#EDE6D6] bg-white text-[#1a1a1a] hover:border-[#B74217]/40"
      }`}
    >
      {children}
    </button>
  );
}

function GuideFilterRows(props: {
  areas: string[];
  highlights: string[];
  area: string;
  highlight: string;
  onArea: (v: string) => void;
  onHighlight: (v: string) => void;
}) {
  const row = (label: string, items: string[], value: string, on: (v: string) => void) =>
    items.length > 1 && (
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[#6b6b6b]">{label}</span>
        <ChipButton active={!value} onClick={() => on("")}>All</ChipButton>
        {items.map((i) => (
          <ChipButton key={i} active={value === slug(i)} onClick={() => on(value === slug(i) ? "" : slug(i))}>
            {i}
          </ChipButton>
        ))}
      </div>
    );
  return (
    <div className="mt-3 flex flex-col gap-2">
      {row("Area", props.areas, props.area, props.onArea)}
      {row("Highlights", props.highlights, props.highlight, props.onHighlight)}
    </div>
  );
}

// ─── /discover ───────────────────────────────────────────────────────────────

type HubType = "all" | "guides" | "events" | "news" | "press";
const CHIPS: { type: HubType; label: string }[] = [
  { type: "all", label: "All" },
  { type: "guides", label: "Town guides" },
  { type: "events", label: "Events" },
  { type: "news", label: "News" },
  { type: "press", label: "Press" },
];

const pressReleases = news.filter((n) => n.pressRelease);
const COUNTS: Record<HubType, number> = {
  all: guides.length + events.length + news.length,
  guides: guides.length,
  events: events.length,
  news: news.length,
  press: pressReleases.length,
};

// The filter lives in the URL (/discover?type=events) so a view can be shared.
// An unknown type, or one with nothing to show, falls back to All.
function typeFromUrl(): HubType {
  if (typeof window === "undefined") return "all";
  const t = new URLSearchParams(window.location.search).get("type") as HubType | null;
  return t && t !== "all" && CHIPS.some((c) => c.type === t) && COUNTS[t] > 0 ? t : "all";
}

// Newest guide, next event, latest news or press release. Only cards with
// content; with nothing but guides, the newest guides instead.
function featuredItems() {
  const byApproved = [...guides].sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt)));
  if (!events.length && !news.length) return byApproved.slice(0, 3).map((g) => ({ kind: "guide" as const, guide: g }));
  return [
    ...(byApproved[0] ? [{ kind: "guide" as const, guide: byApproved[0] }] : []),
    ...(events[0] ? [{ kind: "event" as const, event: events[0] }] : []),
    ...(news[0] ? [{ kind: "news" as const, post: news[0] }] : []),
  ];
}

function DiscoverHub() {
  useSeo({
    title: "Discover dog-friendly places, news and events | BarkFind",
    description: "Dog-friendly town guides, news and events from BarkFind, free to read.",
    path: "/discover",
    image: DISCOVER_IMAGE,
  });
  const [type, setType] = useState<HubType>(typeFromUrl);
  const [query, setQuery] = useState("");
  const filters = useGuideFilters();
  const chips = CHIPS.filter((c) => c.type === "all" || COUNTS[c.type] > 0);
  const featured = useMemo(featuredItems, []);
  const results = useMemo(() => searchAll(query), [query]);
  const searching = query.trim().length > 0;
  const show = (t: HubType) => type === "all" || type === t;

  function choose(t: HubType) {
    setType(t);
    writeParam("type", t === "all" ? "" : t);
  }

  const guideResults = results.guides.map((g) => guideBySlug(g.slug)).filter((g): g is Guide => Boolean(g));
  const newsResults = type === "press" ? results.news.filter((n) => n.pressRelease) : results.news;
  const hasResults =
    (show("guides") && guideResults.length > 0) ||
    (show("events") && results.events.length > 0) ||
    ((show("news") || type === "press") && newsResults.length > 0);
  const newsList = type === "press" ? pressReleases : news;

  return (
    <PageShell title="Discover" subtitle="Dog-friendly town guides, news and events from BarkFind." maxWidth={WIDE}>
      <Breadcrumbs items={[HOME, DISCOVER]} />

      {COUNTS.all > 0 && (
        <div className="rounded-[22px] border border-[#EDE6D6] bg-[#F5F1E9] p-4 md:p-5">
          <TownSearch value={query} onChange={setQuery} label="Search town guides, events and news" placeholder="Search towns, events and news" />
          {chips.length > 2 && (
            <div role="group" aria-label="Show" className="mt-3 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c.type}
                  type="button"
                  onClick={() => choose(c.type)}
                  aria-pressed={type === c.type}
                  className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                    type === c.type
                      ? "border-[#B74217] bg-[#B74217] text-white"
                      : "border-[#EDE6D6] bg-white text-[#1a1a1a] hover:border-[#B74217]/40"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {!searching && (type === "all" || type === "guides") && filters.rows}
        </div>
      )}

      {searching ? (
        <div aria-live="polite">
          {show("guides") && guideResults.length > 0 && (
            <Section title="Town guides">
              <CardGrid>
                {guideResults.map((g) => (
                  <li key={g.slug}>
                    <GuideCard guide={g} />
                  </li>
                ))}
              </CardGrid>
            </Section>
          )}
          {show("events") && results.events.length > 0 && (
            <Section title="Events">
              <ul className="grid gap-3 md:grid-cols-2">
                {results.events.map((e) => (
                  <li key={e.id}>
                    <EventRow event={e} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {(show("news") || type === "press") && newsResults.length > 0 && (
            <Section title="News">
              <CardGrid>
                {newsResults.map((n) => (
                  <li key={n.slug}>
                    <NewsCard post={n} />
                  </li>
                ))}
              </CardGrid>
            </Section>
          )}
          {!hasResults && <p className="mt-8 text-[#585858]">Nothing matches that yet.</p>}
        </div>
      ) : (
        <>
          {type === "all" && featured.length > 0 && (
            <section aria-label="Featured" className="mt-8">
              <CardGrid>
                {featured.map((f) => (
                  <li key={f.kind === "guide" ? `g-${f.guide.slug}` : f.kind === "event" ? `e-${f.event.id}` : `n-${f.post.slug}`}>
                    {f.kind === "guide" ? <GuideCard guide={f.guide} /> : f.kind === "event" ? <EventCard event={f.event} /> : <NewsCard post={f.post} />}
                  </li>
                ))}
              </CardGrid>
            </section>
          )}

          {show("guides") && guides.length > 0 && (
            <Section title="Town guides">
              {filters.list.length ? (
                <GuidesByCounty list={filters.list} />
              ) : (
                <p className="text-[#585858]">No town guide matches those filters yet.</p>
              )}
              <p>
                <a href="/dog-friendly" className={SEE_ALL}>
                  See all {plural(guides.length, "town guide")}
                </a>
              </p>
            </Section>
          )}

          {show("events") && events.length > 0 && (
            <Section title="Events">
              <ul className="grid gap-3 md:grid-cols-2">
                {(type === "events" ? events : events.slice(0, 6)).map((e) => (
                  <li key={e.id}>
                    <EventRow event={e} />
                  </li>
                ))}
              </ul>
              <p>
                <a href="/events" className={SEE_ALL}>
                  See all {plural(events.length, "event")}
                </a>
              </p>
            </Section>
          )}

          {(show("news") || type === "press") && newsList.length > 0 && (
            <Section title={type === "press" ? "Press releases" : "News"}>
              <CardGrid>
                {(type === "all" ? newsList.slice(0, 3) : newsList).map((n) => (
                  <li key={n.slug}>
                    <NewsCard post={n} />
                  </li>
                ))}
              </CardGrid>
              <p>
                <a href="/news" className={SEE_ALL}>
                  See all news
                </a>
              </p>
            </Section>
          )}

        </>
      )}

      <DownloadCta />
    </PageShell>
  );
}

// ─── /dog-friendly ───────────────────────────────────────────────────────────

function GuideIndex() {
  useSeo({
    title: "Dog-friendly town guides | BarkFind",
    description: `Dog-friendly cafes, pubs, walks and beaches in ${plural(guides.length, "UK town")}, with local dog restrictions, from BarkFind.`,
    path: "/dog-friendly",
    image: DISCOVER_IMAGE,
    jsonLd: breadcrumbSchema([HOME, DISCOVER, GUIDES]),
  });
  const [query, setQuery] = useState("");
  const filters = useGuideFilters();
  const list = filters.list.filter((g) => matchesTown(g, query));

  return (
    <PageShell
      title="Dog-friendly town guides"
      subtitle="Places that welcome dogs, town by town, built from BarkFind's venue data and dog owners' reviews."
      maxWidth={WIDE}
    >
      <Breadcrumbs items={[HOME, DISCOVER, GUIDES]} />
      <TownSearch value={query} onChange={setQuery} />
      {filters.rows}
      <div className="mt-8">
        {list.length ? <GuidesByCounty list={list} /> : <p className="text-[#585858]">No guide for that town yet.</p>}
      </div>
      <DownloadCta />
    </PageShell>
  );
}

// ─── /dog-friendly/<town> ────────────────────────────────────────────────────

function GuidePage({ guide }: { guide: Guide }) {
  const path = `/dog-friendly/${guide.slug}`;
  const crumbs = [HOME, DISCOVER, GUIDES, { name: guide.town, path }];
  const image = `${SITE_URL}${guide.photo?.src || DISCOVER_IMAGE}`;
  useSeo({
    title: `${guide.seoTitle} | BarkFind`,
    description: guide.description,
    path,
    ogType: "article",
    image: guide.photo?.src,
    jsonLd: [
      breadcrumbSchema(crumbs),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: guide.title,
        description: guide.description,
        ...(guide.publishedAt ? { datePublished: guide.publishedAt } : {}),
        ...(guide.updated ? { dateModified: guide.updated } : {}),
        mainEntityOfPage: `${SITE_URL}${path}`,
        image: [image],
        publisher: { "@type": "Organization", name: "BarkFind", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/barkfind-logo.png` } },
      },
      // Built from exactly the strings shown in the "Questions about dog rules" section.
      ...(guide.faq.length ? [faqSchema(guide.faq.map((f) => ({ q: f.question, a: f.answer })))] : []),
    ],
  });
  const nearby = guide.nearby.map((s) => guides.find((g) => g.slug === s)).filter((g): g is Guide => Boolean(g));

  return (
    <PageShell
      title={guide.title}
      subtitle={`${placesLabel(guide.venueCount)} · ${guide.county}`}
      meta={guide.updated ? `Updated ${formatDate(guide.updated)}` : undefined}
    >
      <Breadcrumbs items={crumbs} />
      <figure className="mb-8 overflow-hidden rounded-[22px] border border-[#EDE6D6]">
        {guide.photo ? (
          <div className="relative">
            <img
              src={guide.photo.src}
              alt={guide.photo.alt}
              width={guide.photo.width}
              height={guide.photo.height}
              className="h-56 w-full object-cover md:h-72"
            />
            <PhotoCredit photo={guide.photo} linked />
          </div>
        ) : (
          <BrandBlock town={guide.town} tall />
        )}
      </figure>
      <div className="flex flex-col gap-4">
        {guide.blocks.map((b, i) => {
          const cards = guide.places.filter((p) => p.after === i);
          return (
            <div key={i}>
              <Prose html={b.html} />
              {cards.length > 0 && (
                <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                  {cards.map((p) => (
                    <li key={p.id}>
                      <PlaceCard place={p} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {guide.faq.length > 0 && (
        <Section title="Questions about dog rules">
          <dl className="flex flex-col gap-5">
            {guide.faq.map((f) => (
              <div key={f.question}>
                <dt className="font-bold text-[#1a1a1a]">{f.question}</dt>
                <dd className="mt-1">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {nearby.length > 0 && (
        <Section title="Nearby town guides">
          <ul className="grid gap-3 sm:grid-cols-3">
            {nearby.map((g) => (
              <li key={g.slug}>
                <ListingCard href={`/dog-friendly/${g.slug}`} title={g.town} meta={placesLabel(g.venueCount)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-6">
        <a href="/dog-friendly" className={SEE_ALL}>All dog-friendly town guides</a>
        <a href={METHOD_PATH} className={SEE_ALL}>How our town guides are made</a>
      </p>
      <DownloadCta placeCount={guide.venueCount} />
    </PageShell>
  );
}

// ─── /dog-friendly/how-guides-are-made ───────────────────────────────────────

function MethodPage() {
  const crumbs = [HOME, DISCOVER, GUIDES, { name: "How our town guides are made", path: METHOD_PATH }];
  useSeo({
    title: "How our town guides are made | BarkFind",
    description: "Where the facts in BarkFind's dog-friendly town guides come from, how they are checked, and how to report a mistake.",
    path: METHOD_PATH,
    jsonLd: breadcrumbSchema(crumbs),
  });
  return (
    <PageShell title="How our town guides are made" subtitle="Where the facts in our dog-friendly town guides come from, and how we check them.">
      <Breadcrumbs items={crumbs} />
      <Section title="What goes into a guide">
        <p>
          Each guide is drafted from BarkFind's own place data and nothing else: the venue's own dog policy where it
          publishes one, reviews from BarkFind members where there are any, opening hours and facilities. We do not add
          places or details that are not in that data.
        </p>
        <p>
          A town only gets a guide once we hold enough checked places there, such as cafes, pubs, restaurants, parks and
          beaches. A guide is a selection, not a complete list.
        </p>
      </Section>
      <Section title="Council dog rules">
        <p>
          Beach bans, lead rules and other local restrictions come from the council's own published rules. Each one names
          the council and the date we last checked it. Rules change, so always follow the signs when you arrive.
        </p>
      </Section>
      <Section title="Checked by a person">
        <p>
          Guides are drafted with the help of AI from the data above. Josh, who founded BarkFind, reads and approves every
          guide before it is published, and nothing goes live automatically. If we withdraw a guide, it comes off the site
          at the next update.
        </p>
      </Section>
      <Section title="Photos">
        <p>
          Town and place photos come from Geograph, credited to the photographer under a Creative Commons licence, or from
          the venue's own website, credited and linked. We never use Google photos.
        </p>
      </Section>
      <Section title="Money">
        <p>
          A venue cannot pay to be included in a guide or to change what a guide says about it. Anything paid for is
          labelled Paid partnership.
        </p>
      </Section>
      <Section title="Spotted a mistake?">
        <p>
          Email{" "}
          <a href="mailto:info@barkfind.com" className={SEE_ALL}>info@barkfind.com</a> with the town and the place. We
          check every report and correct the guide if it's wrong.
        </p>
      </Section>
      <p className="mt-8">
        <a href="/dog-friendly" className={SEE_ALL}>All dog-friendly town guides</a>
      </p>
      <DownloadCta />
    </PageShell>
  );
}

// ─── /news ───────────────────────────────────────────────────────────────────

function NewsIndex() {
  useSeo({
    title: "News and press releases | BarkFind",
    description: "News and press releases from BarkFind, the UK app for finding dog-friendly places.",
    path: "/news",
  });
  const rest = news.filter((n) => !n.pressRelease);

  return (
    <PageShell title="News" subtitle="What's new at BarkFind, with press releases for journalists first." maxWidth={WIDE}>
      <Breadcrumbs items={[HOME, DISCOVER, NEWS]} />
      {pressReleases.length > 0 && (
        <Section title="Press releases">
          <CardGrid>
            {pressReleases.map((n) => (
              <li key={n.slug}>
                <NewsCard post={n} />
              </li>
            ))}
          </CardGrid>
        </Section>
      )}
      {rest.length > 0 && (
        <Section title={pressReleases.length ? "More news" : "Latest"}>
          <CardGrid>
            {rest.map((n) => (
              <li key={n.slug}>
                <NewsCard post={n} />
              </li>
            ))}
          </CardGrid>
        </Section>
      )}
      <DownloadCta />
    </PageShell>
  );
}

// ─── /news/<slug> ────────────────────────────────────────────────────────────

function NewsPage({ post }: { post: NewsPost }) {
  const path = `/news/${post.slug}`;
  useSeo({
    title: `${post.title} | BarkFind`,
    description: post.summary,
    path,
    ogType: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.summary,
      ...(post.date ? { datePublished: post.date } : {}),
      mainEntityOfPage: `${SITE_URL}${path}`,
      image: [`${SITE_URL}/onboarding-mockup-1.png`],
      author: { "@type": "Organization", name: "BarkFind", url: SITE_URL },
      publisher: { "@type": "Organization", name: "BarkFind", logo: { "@type": "ImageObject", url: `${SITE_URL}/barkfind-logo.png` } },
    },
  });

  return (
    <PageShell
      title={post.title}
      eyebrow={post.pressRelease ? "Press release" : undefined}
      meta={post.date ? formatDate(post.date) : undefined}
    >
      <Breadcrumbs items={[HOME, DISCOVER, NEWS, { name: post.title, path }]} />
      <Prose html={post.html} />
      {post.pressRelease && (
        <p className="mt-8 text-sm text-[#585858]">
          Press enquiries:{" "}
          <a href="mailto:info@barkfind.com" className={SEE_ALL}>info@barkfind.com</a>
        </p>
      )}
      <p className="mt-6">
        <a href="/news" className={SEE_ALL}>All news</a>
      </p>
      <DownloadCta />
    </PageShell>
  );
}

// ─── /events ─────────────────────────────────────────────────────────────────

function eventSchema(e: EventItem): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.date,
    description: e.summary,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: e.venueName || e.town || "United Kingdom",
      address: {
        "@type": "PostalAddress",
        ...(e.town ? { addressLocality: e.town } : {}),
        addressCountry: "GB",
      },
    },
    ...(e.sourceUrl ? { url: e.sourceUrl } : {}),
  };
}

function EventsPage() {
  const schema = useMemo(() => events.map(eventSchema), []);
  useSeo({
    title: "Events for dog owners | BarkFind",
    description: "Upcoming dog-friendly events, listed by BarkFind.",
    path: "/events",
    noindex: events.length === 0,
    jsonLd: schema.length ? schema : undefined,
  });

  return (
    <PageShell title="Events" subtitle="Upcoming events for dog owners.">
      <Breadcrumbs items={[HOME, DISCOVER, EVENTS]} />
      {events.length ? (
        <ul className="flex flex-col gap-5">
          {events.map((e) => (
            <li key={e.id} id={`event-${e.id}`} className="scroll-mt-24 rounded-[22px] border border-[#EDE6D6] px-5 py-5">
              <p className="text-sm font-bold text-[#B74217]">{formatDate(e.date, true)}</p>
              <h2 className="mt-1 font-serif text-2xl text-[#1a1a1a]">{e.title}</h2>
              {(e.town || e.venueName) && (
                <p className="mt-1 text-sm text-[#6b6b6b]">{[e.town, e.venueName].filter(Boolean).join(" · ")}</p>
              )}
              <div className="mt-3">
                <Prose html={e.html} />
              </div>
              {e.sourceUrl && (
                <p className="mt-3 text-sm">
                  <a href={e.sourceUrl} rel="noopener" className={SEE_ALL}>
                    Event details
                  </a>
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[#585858]">No upcoming events listed at the moment.</p>
      )}
      <DownloadCta />
    </PageShell>
  );
}
