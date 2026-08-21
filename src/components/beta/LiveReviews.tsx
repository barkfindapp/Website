import { useEffect, useState } from "react";
import { useReducedMotion } from "./_shared";

type Review = {
  id: string;
  paw_rating: number;
  review_text: string;
  images: string[];
  location_name: string;
  author_first_name: string | null;
  author_town: string | null;
};

const MIN_TO_SHOW = 6; // below this the section does not render at all

function Paws({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} out of 5 paws`}>
      {[...Array(5)].map((_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 40 40" fill={i < n ? "#B74217" : "#E7DFC9"} aria-hidden="true">
          <path d="M7.29 19.46C8.12 20.72 9.41 21.46 10.65 21.5C11.86 21.37 13.17 20.52 13.76 18.65C13.86 17.67 13.6 16.64 13.01 15.74C12.42 14.84 11.58 14.18 10.65 13.87C9.67 13.55 8.7 13.66 7.92 14.17C6.34 15.2 6.06 17.57 7.29 19.46ZM16.46 15.76C17.39 15.62 18.19 15.05 18.71 14.17C19.21 13.32 19.4 12.27 19.25 11.21C18.92 8.97 17.14 7.38 15.28 7.65C14.36 7.79 13.56 8.35 13.03 9.23C12.53 10.08 12.34 11.14 12.5 12.19C12.65 13.26 13.13 14.21 13.86 14.88C14.47 15.45 15.2 15.76 15.95 15.78C16.29 15.78 16.29 15.78 16.46 15.76ZM27.86 12.69C28.08 11.64 27.96 10.58 27.51 9.7C27.05 8.79 26.29 8.17 25.37 7.98C24.46 7.79 23.52 8.04 22.72 8.68C21.95 9.3 21.41 10.22 21.19 11.27C20.71 13.48 21.83 15.59 23.67 15.99C23.84 16.02 24 16.04 24.17 16.05C25.84 16.1 27.43 14.7 27.86 12.69ZM25.16 21.73C24.7 21.58 24.35 21.23 24.18 20.75C23.55 18.88 21.92 17.64 20.01 17.58C18.11 17.52 16.4 18.66 15.64 20.48C15.45 20.94 15.07 21.27 14.61 21.39C12.44 21.91 10.82 23.81 10.75 25.91C10.67 28.56 12.67 30.79 15.23 30.87C16.12 30.9 17.03 30.67 17.84 30.2C18.97 29.54 20.29 29.58 21.36 30.31C22.14 30.83 23.03 31.13 23.93 31.15C26.48 31.24 28.63 29.14 28.71 26.49C28.78 24.39 27.29 22.39 25.16 21.73ZM33.52 17.41C33.48 16.39 33.05 15.51 32.3 14.95C31.56 14.39 30.59 14.23 29.6 14.48C28.64 14.73 27.76 15.33 27.12 16.19C25.77 18 25.9 20.38 27.4 21.51C27.89 21.88 28.48 22.08 29.11 22.1C29.43 22.11 29.77 22.07 30.11 21.99C31.06 21.74 31.94 21.14 32.58 20.28C33.23 19.42 33.56 18.4 33.52 17.41Z" />
        </svg>
      ))}
    </div>
  );
}

export default function LiveReviews() {
  const reduced = useReducedMotion();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setReviews(Array.isArray(d.reviews) ? d.reviews : []);
      })
      .catch(() => alive && setReviews([]));
    return () => {
      alive = false;
    };
  }, []);

  // Render nothing until we know, and nothing below the threshold. No skeletons, no empty state.
  if (!reviews || reviews.length < MIN_TO_SHOW) return null;

  const go = (dir: number) => setIdx((i) => (i + dir + reviews.length) % reviews.length);
  const r = reviews[idx];
  const attributed = r.author_first_name && r.author_town;

  return (
    <section className="py-24" style={{ background: "#F5F3EF" }}>
      <div className="max-w-3xl mx-auto px-6 text-center">
        <p className="text-sm font-bold text-rust uppercase tracking-widest mb-3">From real dog owners</p>
        <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-ink mb-12">What people are saying</h2>

        <div
          className="relative"
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Reviews"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
          }}
        >
          <div className="bg-white rounded-2xl p-8 shadow-sm shadow-stone-200 border border-stone-50" aria-live="polite">
            <div className="flex justify-center mb-4">
              <Paws n={r.paw_rating} />
            </div>
            {r.images?.length > 0 && (
              <img
                src={r.images[0]}
                alt={`Photo at ${r.location_name}`}
                className="w-full max-h-52 object-cover rounded-xl mb-5"
                loading="lazy"
                width={640}
                height={360}
              />
            )}
            <p className="text-ink text-lg leading-relaxed mb-5">“{r.review_text}”</p>
            <p className="text-sm text-ink/70">
              {attributed ? (
                <>
                  <span className="font-bold text-ink">{r.author_first_name}, {r.author_town}</span>
                  <span className="mx-1.5">·</span>
                </>
              ) : null}
              on <span className="font-semibold text-ink">{r.location_name}</span>
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 mt-6">
            <button onClick={() => go(-1)} aria-label="Previous review" className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-ink hover:border-rust focus:outline-none focus-visible:ring-2 focus-visible:ring-rust">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex gap-2">
              {reviews.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to review ${i + 1}`}
                  aria-current={i === idx}
                  className={`${reduced ? "" : "transition-all"} h-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-rust ${i === idx ? "w-6 bg-rust" : "w-2 bg-rust/25"}`}
                />
              ))}
            </div>
            <button onClick={() => go(1)} aria-label="Next review" className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-ink hover:border-rust focus:outline-none focus-visible:ring-2 focus-visible:ring-rust">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
