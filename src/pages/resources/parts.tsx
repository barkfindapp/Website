import { APP_STORE_URL, LAUNCHED } from "../../data/launch";
import { useState } from "react";
import { dateParts, formatDate, type EventItem, type Guide, type GuidePhoto, type NewsPost, type PlaceTeaser } from "./data";

// Shared furniture for the resources section: breadcrumbs, the one download
// call to action each page carries, listing cards and rendered article bodies.

export type Crumb = { name: string; path: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8 text-sm text-[#585858]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="text-[#1a1a1a] font-semibold">{c.name}</span>
              ) : (
                <>
                  <a href={c.path} className="hover:text-[#B74217] transition-colors">{c.name}</a>
                  <span aria-hidden="true" className="text-[#B74217]/50">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// The single download call to action. Before launch it points at the early
// access form on the homepage; flipping LAUNCHED in src/data/launch.ts on
// release day switches it to the App Store with no change here.
// `placeCount` (guide pages) names how many places the app covers in that town.
// The website is free reading; the app adds search, Mylo and recommendations, so
// this says what the app adds rather than suggesting the two are the same thing.
export function DownloadCta({ placeCount }: { placeCount?: number }) {
  const href = LAUNCHED ? APP_STORE_URL : "/#download";
  const label = LAUNCHED ? "Download BarkFind" : "Get early access";
  const note = LAUNCHED
    ? "Free to download on iPhone."
    : "BarkFind is coming to iPhone soon.";
  // No claim that every place has reviews or a Mylo verdict.
  const adds = placeCount
    ? `Opening times and dog policies for ${placeCount === 1 ? "the 1 place" : `all ${placeCount}`}, plus Mylo, are in the app.`
    : "Opening times and dog policies for every place, plus Mylo, are in the app.";
  return (
    <aside id="get-the-app" className="mt-14 scroll-mt-24 rounded-2xl bg-[#FAEFD1] px-6 py-8 md:px-10 md:py-10">
      <h2 className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-3">The full picture is in the app</h2>
      <p className="text-[#444] leading-relaxed max-w-xl">
        {adds} {note}
      </p>
      <a
        href={href}
        className="mt-5 inline-flex items-center px-6 py-3 rounded-full bg-[#B74217] text-white font-bold hover:opacity-90 transition-opacity shadow-sm shadow-[#B74217]/30"
      >
        {label}
      </a>
    </aside>
  );
}

// Listing card. `label` is the only way a card carries a label; the
// "sponsored" variant (phase 3) always reads "Paid partnership", per the CAP Code.
export function ListingCard({
  href,
  title,
  meta,
  summary,
  label,
}: {
  href: string;
  title: string;
  meta?: string;
  summary?: string;
  label?: "sponsored" | "press";
}) {
  return (
    <a
      href={href}
      className="block rounded-2xl border border-stone-200 bg-white px-5 py-4 hover:border-[#B74217]/40 hover:shadow-sm transition"
    >
      {label === "sponsored" && (
        <span className="inline-block mb-2 rounded-full bg-[#1a1a1a] px-2.5 py-0.5 text-xs font-bold text-white">Paid partnership</span>
      )}
      {label === "press" && (
        <span className="inline-block mb-2 rounded-full bg-[#FAEFD1] px-2.5 py-0.5 text-xs font-bold text-[#B74217]">Press release</span>
      )}
      <span className="block font-bold text-[#1a1a1a]">{title}</span>
      {meta && <span className="block mt-0.5 text-sm text-[#585858]">{meta}</span>}
      {summary && <span className="block mt-2 text-sm text-[#444] leading-relaxed">{summary}</span>}
    </a>
  );
}

// Body HTML was rendered from Markdown at build time with raw HTML escaped.
export function Prose({ html }: { html: string }) {
  return <div className="bf-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function TownSearch({
  value,
  onChange,
  label = "Search town guides",
  placeholder = "Type a town",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-full border border-stone-300 bg-white px-5 py-3 text-base text-[#1a1a1a] placeholder:text-[#8a8a8a] focus:outline-none focus:border-[#B74217] focus:ring-2 focus:ring-[#B74217]/20"
      />
    </label>
  );
}

// Every count in the section goes through this, so "1 town guide" never reads "1 town guides".
export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function placesLabel(n: number) {
  return plural(n, "place");
}

// ─── Discover cards ─────────────────────────────────────────────────────────
// One card family in three variants (town guide, event, news/press), modelled
// on the app's Saved Places card: rounded white card, soft shadow, bold name,
// small grey line, cream pill chips. Never on these cards: Google photos or
// ratings, BarkFind ratings, Mylo verdicts or single-place cards.

const CARD =
  "group block h-full overflow-hidden rounded-[22px] border border-[#EDE6D6] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-[#B74217]/30";

function CardLabel({ children, sponsored }: { children: React.ReactNode; sponsored?: boolean }) {
  return (
    <>
      {sponsored && (
        <span className="mb-2 inline-block rounded-full bg-[#1a1a1a] px-2.5 py-0.5 text-xs font-bold text-white">Paid partnership</span>
      )}
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#B74217]">{children}</p>
    </>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[#EDE6D6] bg-[#F5F1E9] px-[11px] py-1 text-xs font-bold text-[#1a1a1a]">{children}</span>
  );
}

// Photo credit, always shown with the photo. On cards it is plain text (the
// whole card is a link); on guide pages the credit and licence are links.
export function PhotoCredit({ photo, linked }: { photo: GuidePhoto; linked?: boolean }) {
  const link = "underline underline-offset-2 hover:text-white";
  return (
    <span className="absolute bottom-1.5 right-2 max-w-[90%] truncate rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/95">
      Photo:{" "}
      {linked && photo.creditUrl ? (
        <a href={photo.creditUrl} rel="noopener" className={link}>{photo.credit}</a>
      ) : (
        photo.credit
      )}
      ,{" "}
      {linked && photo.licenceUrl ? (
        <a href={photo.licenceUrl} rel="license noopener" className={link}>{photo.licence}</a>
      ) : (
        photo.licence
      )}
    </span>
  );
}

// No licensed photo: town name in DM Serif Display on cream, terracotta rule.
export function BrandBlock({ town, tall }: { town: string; tall?: boolean }) {
  return (
    <div className={`flex ${tall ? "h-56 md:h-72" : "h-[170px]"} flex-col items-center justify-center border-b border-[#EDE6D6] bg-[#F5F1E9] px-4 text-center`}>
      <span className="font-serif text-[32px] leading-tight text-[#1a1a1a]">{town}</span>
      <i aria-hidden="true" className="mt-2.5 block h-[3px] w-11 rounded-sm bg-[#B74217]" />
    </div>
  );
}

export function GuideCard({ guide, sponsored }: { guide: Guide; sponsored?: boolean }) {
  return (
    <a href={`/dog-friendly/${guide.slug}`} className={CARD}>
      {guide.photo ? (
        <div className="relative h-[170px] bg-[#F5F1E9]">
          <img src={guide.photo.src} alt={guide.photo.alt} width={guide.photo.width} height={guide.photo.height} loading="lazy" className="h-full w-full object-cover" />
          <PhotoCredit photo={guide.photo} />
        </div>
      ) : (
        <BrandBlock town={guide.town} />
      )}
      <div className="px-[18px] pb-[18px] pt-4">
        <CardLabel sponsored={sponsored}>Town guide</CardLabel>
        <p className="text-[19px] font-extrabold text-[#1a1a1a]">{guide.town}</p>
        <p className="mb-2.5 mt-0.5 text-sm text-[#6b6b6b]">{placesLabel(guide.venueCount)} · {guide.county}</p>
        {guide.summary && <p className="mb-3 text-sm leading-normal text-[#1a1a1a] line-clamp-3">{guide.summary}</p>}
        {guide.highlights.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{guide.highlights.map((h) => <Chip key={h}>{h}</Chip>)}</div>
        )}
        {guide.rule && (
          <p
            className="mt-2.5 rounded-xl bg-[#E6F2F1] px-[11px] py-2 text-xs font-bold text-[#2c6f6c]"
            title={`${guide.rule.authority}${guide.rule.checked ? `, checked ${formatDate(guide.rule.checked)}` : ""}`}
          >
            {guide.rule.text}
          </p>
        )}
      </div>
    </a>
  );
}

export function DateBlock({ iso, compact }: { iso: string; compact?: boolean }) {
  const p = dateParts(iso);
  return compact ? (
    <span aria-hidden="true" className="flex h-16 w-14 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-[#B74217] text-white">
      <b className="text-[10px] tracking-[0.1em]">{p.day}</b>
      <strong className="font-serif text-2xl font-normal leading-none">{p.date}</strong>
      <b className="text-[10px] tracking-[0.1em]">{p.month}</b>
    </span>
  ) : (
    <div aria-hidden="true" className="flex h-[110px] flex-col items-center justify-center bg-[#B74217] text-white">
      <b className="text-[13px] tracking-[0.1em]">{p.day}</b>
      <strong className="font-serif text-[40px] font-normal leading-none">{p.date}</strong>
      <b className="text-[13px] tracking-[0.1em]">{p.month}</b>
    </div>
  );
}

export function EventCard({ event }: { event: EventItem }) {
  return (
    <a href={`/events#event-${event.id}`} className={CARD}>
      <DateBlock iso={event.date} />
      <div className="px-[18px] pb-[18px] pt-4">
        <CardLabel>Event</CardLabel>
        <p className="text-[19px] font-extrabold text-[#1a1a1a]">{event.title}</p>
        <p className="mb-2.5 mt-0.5 text-sm text-[#6b6b6b]">
          <span className="sr-only">{formatDate(event.date, true)} · </span>
          {[event.town, event.venueName].filter(Boolean).join(" · ")}
        </p>
        {event.summary && <p className="text-sm leading-normal text-[#1a1a1a] line-clamp-3">{event.summary}</p>}
      </div>
    </a>
  );
}

// Compact event row for lists: date badge, title, town and venue.
export function EventRow({ event }: { event: Pick<EventItem, "id" | "title" | "date" | "town" | "venueName"> }) {
  return (
    <a href={`/events#event-${event.id}`} className="flex items-center gap-4 rounded-2xl border border-[#EDE6D6] bg-white p-3 pr-4 transition hover:border-[#B74217]/30">
      <DateBlock iso={event.date} compact />
      <span className="min-w-0">
        <span className="sr-only">{formatDate(event.date, true)}: </span>
        <span className="block font-extrabold text-[#1a1a1a]">{event.title}</span>
        {(event.town || event.venueName) && (
          <span className="block text-sm text-[#6b6b6b]">{[event.town, event.venueName].filter(Boolean).join(" · ")}</span>
        )}
      </span>
    </a>
  );
}

export function NewsCard({ post }: { post: Pick<NewsPost, "slug" | "title" | "date" | "pressRelease" | "summary"> }) {
  return (
    <a href={`/news/${post.slug}`} className={CARD}>
      <div className="px-[18px] pb-[18px] pt-4">
        <CardLabel>{post.pressRelease ? "Press release" : "News"}</CardLabel>
        <p className="text-[19px] font-extrabold text-[#1a1a1a]">{post.title}</p>
        {post.date && <p className="mb-2.5 mt-0.5 text-sm text-[#6b6b6b]">{formatDate(post.date)}</p>}
        {post.summary && <p className="text-sm leading-normal text-[#1a1a1a] line-clamp-3">{post.summary}</p>}
      </div>
    </a>
  );
}

// ─── Teaser place cards (guide pages) ───────────────────────────────────────
// A teaser for a place the guide names. Our own data only: category, street,
// BarkFind dog-policy reading and amenities. Never ratings, opening hours, Mylo
// verdicts or review text; those sit behind the locked strip, in the app.

const ICON_PATHS: Record<string, string> = {
  cafe: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Zm11 1h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3m3-3v3",
  pub: "M7 4h9l-1 15a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2L7 4Zm0.5 5h8",
  bar: "M5 4h14l-7 8-7-8Zm7 8v8m-4 0h8",
  restaurant: "M7 3v8a2 2 0 0 0 2 2h0V21M5 3v6m4-6v6m8-6c-2 0-3 2-3 5s1 4 3 4V21",
  park: "M12 3l6 9h-4l4 6H6l4-6H6l6-9Zm0 15v3",
  beach: "M3 17c2 0 2-1.5 4.5-1.5S10 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17M17 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  "pet-store": "M5 8h14l-1 12H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2",
  vet: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4Z",
  groomer: "M6 6a2.5 2.5 0 1 0 0 .1M6 18a2.5 2.5 0 1 0 0 .1M8 7l12 10M8 17 20 7",
};

// The category tile: shown when a place has no usable photo, or its website
// photo fails to load. Brand style, never a stock photo.
export function CategoryTile({ category, label }: { category: string | null; label: string | null }) {
  const d = (category && ICON_PATHS[category]) || ICON_PATHS.park;
  return (
    <div className="flex h-[150px] flex-col items-center justify-center gap-2 border-b border-[#EDE6D6] bg-[#F5F1E9]">
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-[#B74217]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
      {label && <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b6b6b]">{label}</span>}
    </div>
  );
}

function PolicyChip({ policy }: { policy: NonNullable<PlaceTeaser["policy"]> }) {
  const tone =
    policy.kind === "welcome"
      ? "border-[#96BD99]/50 bg-[#EEF5EE] text-[#3f6b44]"
      : "border-[#EDE6D6] bg-[#F5F1E9] text-[#1a1a1a]";
  return <span className={`rounded-full border px-[11px] py-1 text-xs font-bold ${tone}`}>{policy.label}</span>;
}

function PlacePhoto({ place }: { place: PlaceTeaser }) {
  const [failed, setFailed] = useState(false);
  const photo = place.photo;
  if (!photo || failed) return <CategoryTile category={place.category} label={place.categoryLabel} />;
  const link = "underline underline-offset-2 hover:text-white";
  return (
    <div className="relative h-[150px] bg-[#F5F1E9]">
      {photo.kind === "website" ? (
        // Venue's own photo: hotlinked, never copied, no referrer sent. Shown whole
        // on cream (contain, not cover) so a logo is never cropped.
        <img src={photo.src} alt={place.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain p-2" />
      ) : (
        <img src={photo.src} alt={place.name} width={photo.width} height={photo.height} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
      <span className="absolute bottom-1.5 right-2 max-w-[92%] truncate rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/95">
        Photo:{" "}
        {photo.kind === "website" ? (
          <a href={photo.creditUrl} rel="noopener" referrerPolicy="no-referrer" className={link}>{photo.credit}</a>
        ) : (
          <>
            {photo.creditUrl ? <a href={photo.creditUrl} rel="noopener" className={link}>{photo.credit}</a> : photo.credit},{" "}
            {photo.licenceUrl ? <a href={photo.licenceUrl} rel="license noopener" className={link}>{photo.licence}</a> : photo.licence}
          </>
        )}
      </span>
    </div>
  );
}

// The locked strip scrolls to the page's one download box; it is not a second
// download link.
function LockedStrip() {
  return (
    <a
      href="#get-the-app"
      onClick={(e) => {
        const box = document.getElementById("get-the-app");
        if (box) {
          e.preventDefault();
          box.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }}
      className="mt-auto flex items-center gap-2 border-t border-[#EDE6D6] bg-[#F5F1E9] px-[18px] py-2.5 text-xs font-bold text-[#6b6b6b] transition hover:text-[#B74217]"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      Mylo's verdict, opening times and reviews are in the app
    </a>
  );
}

export function PlaceCard({ place }: { place: PlaceTeaser }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[22px] border border-[#EDE6D6] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <PlacePhoto place={place} />
      <div className="px-[18px] pb-4 pt-3.5">
        <h3 className="text-[17px] font-extrabold leading-snug text-[#1a1a1a]">{place.name}</h3>
        {(place.categoryLabel || place.street) && (
          <p className="mt-0.5 text-sm text-[#6b6b6b]">{[place.categoryLabel, place.street].filter(Boolean).join(" · ")}</p>
        )}
        {(place.policy || place.amenities.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {place.policy && <PolicyChip policy={place.policy} />}
            {place.amenities.map((a) => <Chip key={a}>{a}</Chip>)}
          </div>
        )}
      </div>
      <LockedStrip />
    </article>
  );
}
