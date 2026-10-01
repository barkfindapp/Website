import { APP_STORE_URL, LAUNCHED } from "../../data/launch";

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

export function TownSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="sr-only">Search town guides</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a town"
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
