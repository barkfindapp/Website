import { useMemo, useState } from "react";
import PageShell, { Section } from "../../components/PageShell";
import LandingPage from "../LandingPage";
import { SITE_URL, breadcrumbSchema, useSeo } from "../../lib/seo";
import {
  events,
  formatDate,
  groupByCounty,
  guideBySlug,
  guides,
  manifest,
  matchesTown,
  news,
  newsBySlug,
  type EventItem,
  type Guide,
  type NewsPost,
} from "./data";
import { Breadcrumbs, DownloadCta, ListingCard, Prose, TownSearch, placesLabel, type Crumb } from "./parts";

// Router for the resources section. Every page here renders from build-time
// JSON (see ./data.ts). A path with no published piece behind it falls through
// to the homepage, exactly like any other unknown URL: no stubs, no
// "coming soon" pages.

const HOME: Crumb = { name: "Home", path: "/" };
const RESOURCES: Crumb = { name: "Resources", path: "/resources" };
const GUIDES: Crumb = { name: "Dog-friendly guides", path: "/dog-friendly" };
const NEWS: Crumb = { name: "News", path: "/news" };
const EVENTS: Crumb = { name: "Events", path: "/events" };

export default function ResourcesRoutes({ path }: { path: string }) {
  if (path === "/resources") return <ResourcesLanding />;
  if (path === "/dog-friendly") return guides.length ? <GuideIndex /> : <LandingPage />;
  if (path.startsWith("/dog-friendly/")) {
    const guide = guideBySlug(path.slice("/dog-friendly/".length));
    return guide ? <GuidePage guide={guide} /> : <LandingPage />;
  }
  if (path === "/news") return news.length ? <NewsIndex /> : <LandingPage />;
  if (path.startsWith("/news/")) {
    const post = newsBySlug(path.slice("/news/".length));
    return post ? <NewsPage post={post} /> : <LandingPage />;
  }
  if (path === "/events") return <EventsPage />;
  return <LandingPage />;
}

// ─── /resources ──────────────────────────────────────────────────────────────

function ResourcesLanding() {
  useSeo({
    title: "Resources for dog owners | BarkFind",
    description: "Dog-friendly town guides, BarkFind news and upcoming events for dog owners in the UK.",
    path: "/resources",
  });
  const [query, setQuery] = useState("");
  const matches = useMemo(() => manifest.filter((g) => matchesTown(g, query)), [query]);
  const latestNews = news.slice(0, 3);
  const upcoming = events.slice(0, 5);

  return (
    <PageShell title="Resources" subtitle="Town guides for dog owners, news from BarkFind and upcoming events.">
      <Breadcrumbs items={[HOME, RESOURCES]} />

      {manifest.length > 0 && (
        <Section title="Dog-friendly town guides">
          <p>Where to eat, drink and walk with your dog, town by town, with local dog restrictions and where they come from.</p>
          <TownSearch value={query} onChange={setQuery} />
          {query.trim() ? (
            matches.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {matches.map((g) => (
                  <li key={g.slug}>
                    <ListingCard href={`/dog-friendly/${g.slug}`} title={g.town} meta={`${g.county} · ${placesLabel(g.venueCount)}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#585858]">No guide for that town yet.</p>
            )
          ) : null}
          <p>
            <a href="/dog-friendly" className="font-semibold text-[#B74217] hover:underline">
              Browse all {manifest.length} town guides
            </a>
          </p>
        </Section>
      )}

      {latestNews.length > 0 && (
        <Section title="Latest news">
          <ul className="grid gap-3">
            {latestNews.map((n) => (
              <li key={n.slug}>
                <ListingCard href={`/news/${n.slug}`} title={n.title} meta={formatDate(n.date)} label={n.pressRelease ? "press" : undefined} />
              </li>
            ))}
          </ul>
          <p>
            <a href="/news" className="font-semibold text-[#B74217] hover:underline">All news</a>
          </p>
        </Section>
      )}

      <Section title="Upcoming events">
        {upcoming.length ? (
          <>
            <ul className="grid gap-3">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <ListingCard href="/events" title={e.title} meta={eventMeta(e)} />
                </li>
              ))}
            </ul>
            <p>
              <a href="/events" className="font-semibold text-[#B74217] hover:underline">All events</a>
            </p>
          </>
        ) : (
          <p className="text-[#585858]">No upcoming events listed at the moment.</p>
        )}
      </Section>

      <DownloadCta />
    </PageShell>
  );
}

// ─── /dog-friendly ───────────────────────────────────────────────────────────

function GuideIndex() {
  useSeo({
    title: "Dog-friendly town guides | BarkFind",
    description: `Dog-friendly cafes, pubs, walks and beaches in ${manifest.length} UK towns, with local dog restrictions, from BarkFind.`,
    path: "/dog-friendly",
    jsonLd: breadcrumbSchema([HOME, RESOURCES, GUIDES]),
  });
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupByCounty(manifest.filter((g) => matchesTown(g, query))), [query]);

  return (
    <PageShell title="Dog-friendly town guides" subtitle="Places that welcome dogs, town by town, built from BarkFind's venue data and dog owners' reviews.">
      <Breadcrumbs items={[HOME, RESOURCES, GUIDES]} />
      <TownSearch value={query} onChange={setQuery} />
      {groups.length ? (
        groups.map(({ county, items }) => (
          <Section key={county} title={county}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((g) => (
                <li key={g.slug}>
                  <ListingCard href={`/dog-friendly/${g.slug}`} title={g.town} meta={placesLabel(g.venueCount)} summary={g.summary} />
                </li>
              ))}
            </ul>
          </Section>
        ))
      ) : (
        <p className="mt-8 text-[#585858]">No guide for that town yet.</p>
      )}
      <DownloadCta />
    </PageShell>
  );
}

// ─── /dog-friendly/<town> ────────────────────────────────────────────────────

function GuidePage({ guide }: { guide: Guide }) {
  const path = `/dog-friendly/${guide.slug}`;
  const crumbs = [HOME, RESOURCES, GUIDES, { name: guide.town, path }];
  useSeo({
    title: `${guide.title} | BarkFind`,
    description: guide.summary,
    path,
    ogType: "article",
    jsonLd: breadcrumbSchema(crumbs),
  });
  const nearby = guide.nearby.map((s) => guides.find((g) => g.slug === s)).filter((g): g is Guide => Boolean(g));

  return (
    <PageShell title={guide.title} subtitle={guide.county} meta={guide.updated ? `Updated ${formatDate(guide.updated)}` : undefined}>
      <Breadcrumbs items={crumbs} />
      <Prose html={guide.html} />

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
      <p className="mt-6">
        <a href="/dog-friendly" className="font-semibold text-[#B74217] hover:underline">All dog-friendly town guides</a>
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
  const press = news.filter((n) => n.pressRelease);
  const rest = news.filter((n) => !n.pressRelease);
  const card = (n: NewsPost) => (
    <li key={n.slug}>
      <ListingCard href={`/news/${n.slug}`} title={n.title} meta={formatDate(n.date)} summary={n.summary} label={n.pressRelease ? "press" : undefined} />
    </li>
  );

  return (
    <PageShell title="News" subtitle="What's new at BarkFind, with press releases for journalists first.">
      <Breadcrumbs items={[HOME, RESOURCES, NEWS]} />
      {press.length > 0 && (
        <Section title="Press releases">
          <p>
            For press enquiries, email{" "}
            <a href="mailto:info@barkfind.com" className="font-semibold text-[#B74217] hover:underline">info@barkfind.com</a>.
          </p>
          <ul className="grid gap-3">{press.map(card)}</ul>
        </Section>
      )}
      {rest.length > 0 && (
        <Section title={press.length ? "More news" : "Latest"}>
          <ul className="grid gap-3">{rest.map(card)}</ul>
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
      <Breadcrumbs items={[HOME, RESOURCES, NEWS, { name: post.title, path }]} />
      <Prose html={post.html} />
      {post.pressRelease && (
        <p className="mt-8 text-sm text-[#585858]">
          Press enquiries:{" "}
          <a href="mailto:info@barkfind.com" className="font-semibold text-[#B74217] hover:underline">info@barkfind.com</a>
        </p>
      )}
      <p className="mt-6">
        <a href="/news" className="font-semibold text-[#B74217] hover:underline">All news</a>
      </p>
      <DownloadCta />
    </PageShell>
  );
}

// ─── /events ─────────────────────────────────────────────────────────────────

function eventMeta(e: EventItem) {
  return [formatDate(e.date, true), e.venueName, e.town].filter(Boolean).join(" · ");
}

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
      <Breadcrumbs items={[HOME, RESOURCES, EVENTS]} />
      {events.length ? (
        <ul className="flex flex-col gap-5">
          {events.map((e) => (
            <li key={e.id} className="rounded-2xl border border-stone-200 px-5 py-5">
              <p className="text-sm font-bold text-[#B74217]">{formatDate(e.date, true)}</p>
              <h2 className="mt-1 font-serif text-2xl text-[#1a1a1a]">{e.title}</h2>
              {(e.venueName || e.town) && (
                <p className="mt-1 text-sm text-[#585858]">{[e.venueName, e.town].filter(Boolean).join(", ")}</p>
              )}
              <div className="mt-3">
                <Prose html={e.html} />
              </div>
              {e.sourceUrl && (
                <p className="mt-3 text-sm">
                  <a href={e.sourceUrl} rel="noopener" className="font-semibold text-[#B74217] hover:underline">
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
