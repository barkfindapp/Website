import { Fragment, type ReactNode } from "react";
import { AssetPlaceholder, useInView, useReducedMotion } from "./beta/_shared";

// Rust full-width band: two photo cards left, text right, reveal on scroll.
// Extracted from the beta "Meet Mylo" story so the same band can be reused for
// other people/subjects. Layout and styles are unchanged from that band; the
// label, paragraphs and two photo slots are props. A photo with no `src` shows
// the same labelled placeholder the beta page uses until a real file lands.
type Photo = { alt: string; src?: string; placeholderLabel: string };

export default function StoryBand({
  label,
  paragraphs,
  photos,
}: {
  label: string;
  paragraphs: ReactNode[];
  photos: [Photo, Photo];
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.25, true);
  const revealed = reduced || inView;

  return (
    <section className="py-24 overflow-hidden" style={{ background: "linear-gradient(160deg, #B74217 0%, #9a3512 100%)" }}>
      <div
        ref={ref}
        className="max-w-5xl mx-auto px-6"
        style={{
          transition: reduced ? undefined : "opacity 0.7s ease, transform 0.7s ease",
          opacity: revealed ? 1 : 0,
          transform: revealed ? "translateY(0)" : "translateY(24px)",
        }}
      >
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Photos, offset for the stacked look */}
          <div className="flex-1 w-full flex gap-4 justify-center">
            <div className="w-40 sm:w-48 rounded-2xl overflow-hidden shadow-2xl bg-white/10">
              {photos[0].src ? (
                <img src={photos[0].src} alt={photos[0].alt} className="w-full h-full object-cover" style={{ aspectRatio: "3 / 4" }} loading="lazy" width={480} height={640} />
              ) : (
                <AssetPlaceholder label={photos[0].placeholderLabel} ratio="3 / 4" rounded="rounded-2xl" />
              )}
            </div>
            <div className="w-40 sm:w-48 mt-10 rounded-2xl overflow-hidden shadow-2xl bg-white/10">
              {photos[1].src ? (
                <img src={photos[1].src} alt={photos[1].alt} className="w-full h-full object-cover" style={{ aspectRatio: "3 / 4" }} loading="lazy" width={480} height={640} />
              ) : (
                <AssetPlaceholder label={photos[1].placeholderLabel} ratio="3 / 4" rounded="rounded-2xl" />
              )}
            </div>
          </div>

          {/* Copy */}
          <div className="flex-1 text-white">
            <p className="text-sm font-bold uppercase tracking-widest mb-4 text-white/70">{label}</p>
            <div className="flex flex-col gap-4 text-lg leading-relaxed text-white/90">
              {paragraphs.map((p, i) => (
                <Fragment key={i}>{p}</Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
