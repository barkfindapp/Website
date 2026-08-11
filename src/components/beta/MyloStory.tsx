import { AssetPlaceholder, useInView, useReducedMotion } from "./_shared";

// Real photographs of Mylo only. Flip once at least two are supplied.
const HAS_PHOTOS = false;
const PHOTO_PORTRAIT = "/media/mylo-portrait.jpg";
const PHOTO_LANDSCAPE = "/media/mylo-landscape.jpg";

export default function MyloStory() {
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
          {/* Photos — his coat is the palette */}
          <div className="flex-1 w-full flex gap-4 justify-center">
            <div className="w-40 sm:w-48 rounded-2xl overflow-hidden shadow-2xl bg-white/10">
              {HAS_PHOTOS ? (
                <img src={PHOTO_PORTRAIT} alt="Mylo the Vizsla" className="w-full h-full object-cover" style={{ aspectRatio: "3 / 4" }} loading="lazy" width={480} height={640} />
              ) : (
                <AssetPlaceholder label="Photo of Mylo (portrait)" ratio="3 / 4" rounded="rounded-2xl" />
              )}
            </div>
            <div className="w-40 sm:w-48 mt-10 rounded-2xl overflow-hidden shadow-2xl bg-white/10">
              {HAS_PHOTOS ? (
                <img src={PHOTO_LANDSCAPE} alt="Mylo out and about" className="w-full h-full object-cover" style={{ aspectRatio: "3 / 4" }} loading="lazy" width={480} height={640} />
              ) : (
                <AssetPlaceholder label="Photo of Mylo (out and about)" ratio="3 / 4" rounded="rounded-2xl" />
              )}
            </div>
          </div>

          {/* Copy — first person, dry */}
          <div className="flex-1 text-white">
            <p className="text-sm font-bold uppercase tracking-widest mb-4 text-white/70">Meet Mylo</p>
            <div className="flex flex-col gap-4 text-lg leading-relaxed text-white/90">
              <p>Mylo is a Vizsla. Rust-red, permanently attached to my leg, and physically incapable of being left at home.</p>
              <p>Which turns out to be the whole problem. Finding places that genuinely want a dog, rather than just tolerate one, is harder than it ought to be.</p>
              <p>So we built the app for him: the map, the reviews, the AI that borrows his name. All of it started with one dog who had to come everywhere.</p>
              <p className="text-white font-semibold">The colour you see across BarkFind is his coat.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
