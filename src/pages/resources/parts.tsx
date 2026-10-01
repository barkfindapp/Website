import { APP_STORE_URL, LAUNCHED } from "../../data/launch";
import { dateParts, formatDate, type EventItem, type Guide, type GuidePhoto, type NewsPost } from "./data";

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
    <aside className="mt-14 rounded-2xl bg-[#FAEFD1] px-6 py-8 md:px-10 md:py-10">
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

// Press box for journalists (press pitch, week of 5 October). The press release
// link only appears when an approved one exists; the rest stands on its own.
export function PressBox({ latest }: { latest?: { slug: string; title: string } }) {
  const link = "font-semibold text-[#B74217] hover:underline";
  return (
    <section aria-labelledby="press-box" className="mt-10 rounded-2xl border border-stone-200 bg-white px-6 py-6 md:px-8">
      <h2 id="press-box" className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-3">For press</h2>
      <div className="flex flex-col gap-1 text-[#444] leading-relaxed">
        <p>BarkFind was built in Weston-super-Mare by Josh Holder.</p>
        <p>His Vizsla, Mylo, is reactive, so a sign saying dogs welcome was never enough to go on.</p>
        <p>BarkFind checks what each place actually allows, so you know before you set off.</p>
      </div>
      <ul className="mt-5 flex flex-col gap-2 text-sm">
        {latest && (
          <li>
            Latest press release: <a href={`/news/${latest.slug}`} className={link}>{latest.title}</a>
          </li>
        )}
        <li>
          Logos: <a href="/barkfind-logo-rust.png" download="barkfind-logo-rust.png" className={link}>terracotta (PNG)</a>
          {" · "}
          <a href="/barkfind-logo-white.png" download="barkfind-logo-white.png" className={link}>white (PNG)</a>
        </li>
        <li>
          Press contact: <a href="mailto:info@barkfind.com" className={link}>info@barkfind.com</a>
        </li>
      </ul>
    </section>
  );
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
