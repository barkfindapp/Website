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
export function DownloadCta() {
  const href = LAUNCHED ? APP_STORE_URL : "/#download";
  const label = LAUNCHED ? "Download BarkFind" : "Get early access";
  const note = LAUNCHED
    ? "Free to download on iPhone."
    : "BarkFind is coming to iPhone soon.";
  return (
    <aside className="mt-14 rounded-2xl bg-[#FAEFD1] px-6 py-8 md:px-10 md:py-10">
      <h2 className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-3">The full picture is in the app</h2>
      <p className="text-[#444] leading-relaxed max-w-xl">
        Opening times, dog policies, reviews from other dog owners and Mylo, all on one map with filters. {note}
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

export function placesLabel(n: number) {
  return n === 1 ? "1 place" : `${n} places`;
}
