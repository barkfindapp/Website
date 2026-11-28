import { useEffect, useRef, useState } from "react";

// "Dog-friendly places near you": a location-aware taster on the homepage, fed by
// /api/nearby (Vercel geo, no prompt). Cards rank by rating server-side, but no
// rating is shown here, the number stays in the app. Each card links through to
// the town's guide via Discover search.

type Place = {
  id: string;
  name: string;
  town: string | null;
  policy: string | null;
  policyLabel: string | null;
  image: string | null;
  distanceKm: number;
};

type Payload = { city: string; places: Place[] };

function miles(km: number): string {
  const mi = km * 0.621371;
  if (mi < 0.1) return "nearby";
  const n = mi < 10 ? Math.round(mi * 10) / 10 : Math.round(mi);
  return `${n} ${n === 1 ? "mile" : "miles"} away`;
}

function Card({ place }: { place: Place }) {
  const [failed, setFailed] = useState(false);
  const href = place.town ? `/discover?q=${encodeURIComponent(place.town)}` : "/discover";
  const sub = [place.town, miles(place.distanceKm)].filter(Boolean).join(" · ");
  return (
    <a
      href={href}
      className="group block w-[250px] flex-shrink-0 snap-start overflow-hidden rounded-[22px] border border-[#EDE6D6] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition hover:border-[#B74217]/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="relative h-[150px] bg-[#F5F1E9]">
        {place.image && !failed ? (
          <img
            src={place.image}
            alt={place.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="font-serif text-[22px] leading-tight text-[#1a1a1a]">{place.name}</span>
            <i aria-hidden="true" className="mt-2.5 block h-[3px] w-10 rounded-sm bg-[#B74217]" />
          </div>
        )}
        {place.policyLabel && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#3f6b44] shadow-sm backdrop-blur-sm">
            {place.policyLabel}
          </span>
        )}
      </div>
      <div className="px-[18px] pb-[18px] pt-3.5">
        <p className="truncate text-[16px] font-extrabold text-[#1a1a1a]">{place.name}</p>
        {sub && <p className="mt-0.5 truncate text-sm text-[#6b6b6b]">{sub}</p>}
      </div>
    </a>
  );
}

function SkeletonCard() {
  return (
    <div className="w-[250px] flex-shrink-0 overflow-hidden rounded-[22px] border border-[#EDE6D6] bg-white">
      <div className="h-[150px] animate-pulse bg-[#F0EADC]" />
      <div className="px-[18px] pb-[18px] pt-3.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[#F0EADC]" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-[#F0EADC]" />
      </div>
    </div>
  );
}

export default function NearbyPlaces() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/nearby")
      .then((r) => r.json())
      .then((d: Payload) => {
        if (!live) return;
        if (d && Array.isArray(d.places) && d.places.length > 0) {
          setData(d);
          setStatus("ready");
        } else {
          setStatus("empty");
        }
      })
      .catch(() => live && setStatus("empty"));
    return () => {
      live = false;
    };
  }, []);

  // Nothing worth showing (no coverage reachable, or the request failed): collapse.
  if (status === "empty") return null;

  const city = data?.city && data.city !== "you" ? data.city : "you";

  const scrollBy = (dir: 1 | -1) => {
    scroller.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <section className="bg-[#FAF6EC] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="font-serif text-2xl text-[#1a1a1a] md:text-3xl">
            Dog-friendly places near <span className="text-[#B74217]">{city}</span>
          </h2>
          <div className="hidden flex-shrink-0 gap-2 md:flex">
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scrollBy(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#EDE6D6] bg-white text-[#1a1a1a] transition hover:border-[#B74217]/40 hover:text-[#B74217]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scrollBy(1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#EDE6D6] bg-white text-[#1a1a1a] transition hover:border-[#B74217]/40 hover:text-[#B74217]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {status === "loading"
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            : data!.places.map((p) => <Card key={p.id} place={p} />)}
        </div>

        <p className="mt-4 text-sm text-[#6b6b6b]">
          Checked for dog policies, not just a sticker in the window. Opening times and Mylo's verdict are in the app.
        </p>
      </div>
    </section>
  );
}
