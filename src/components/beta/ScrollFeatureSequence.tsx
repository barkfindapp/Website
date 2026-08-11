import { useEffect, useRef, useState } from "react";
import { PhoneFrame, AssetPlaceholder, useReducedMotion } from "./_shared";

const HAS_STILLS = false; // flip once the five screenshots are supplied

const STEPS = [
  { key: "search", still: "/media/step-search.png", eyebrow: "Can I bring the dog?", title: "Find dog-friendly spots near you", body: "Search the map and watch dog-welcome places drop in as pins, cafes, pubs, parks, the lot." },
  { key: "profile", still: "/media/step-profile.png", eyebrow: "Somewhere that suits your dog", title: "Matched to your dog, not just any dog", body: "Tell BarkFind your dog's temperament and indoor comfort, and it leans towards places that actually suit them." },
  { key: "venue", still: "/media/step-venue.png", eyebrow: "Know before you go", title: "Real amenities and opening hours", body: "Water bowls, off-lead space, indoor seating, opening hours, no more turning up to a maybe." },
  { key: "mylo", still: "/media/step-mylo.png", eyebrow: "Just ask", title: "Ask Mylo", body: "Say what you need in plain English and Mylo finds it from BarkFind's rated directory." },
  { key: "saved", still: "/media/step-saved.png", eyebrow: "Keep your favourites", title: "Save the places that worked", body: "Build a go-to list so the good ones are one tap away next time." },
];

function StepStill({ step }: { step: (typeof STEPS)[number] }) {
  if (!HAS_STILLS) return <AssetPlaceholder label={`Screenshot: ${step.key}`} rounded="rounded-none" />;
  return <img src={step.still} alt={step.title} className="w-full h-full object-cover object-top" width={1080} height={2340} loading="lazy" />;
}

export default function ScrollFeatureSequence() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const markers = useRef<(HTMLDivElement | null)[]>([]);

  // Preload only the next still in the sequence.
  useEffect(() => {
    if (!HAS_STILLS) return;
    const next = STEPS[active + 1];
    if (next) {
      const img = new Image();
      img.src = next.still;
    }
  }, [active]);

  // Active step from whichever marker is centred in the viewport.
  useEffect(() => {
    if (reduced) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = markers.current.findIndex((m) => m === e.target);
            if (idx >= 0) setActive(idx);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    markers.current.forEach((m) => m && io.observe(m));
    return () => io.disconnect();
  }, [reduced]);

  // Reduced motion / mobile-friendly: plain stack, every still above its copy, no transitions.
  if (reduced) {
    return (
      <section className="py-20 bg-cream/40">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-sm font-bold text-rust uppercase tracking-widest mb-3 text-center">How it works</p>
          <h2 className="font-serif text-3xl md:text-4xl text-ink mb-12 text-center">One app, from “where?” to “sorted”</h2>
          <div className="flex flex-col gap-14">
            {STEPS.map((s) => (
              <div key={s.key} className="flex flex-col items-center gap-5">
                <PhoneFrame className="w-52"><StepStill step={s} /></PhoneFrame>
                <div className="text-center max-w-md">
                  <p className="text-xs font-bold text-rust uppercase tracking-widest mb-1">{s.eyebrow}</p>
                  <h3 className="font-bold text-ink text-lg mb-1">{s.title}</h3>
                  <p className="text-sm text-ink/70 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-cream/40">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-4">
          <p className="text-sm font-bold text-rust uppercase tracking-widest mb-3">How it works</p>
          <h2 className="font-serif text-3xl md:text-4xl text-ink">One app, from “where?” to “sorted”</h2>
        </div>

        {/* Mobile: linear stack, still above each copy block */}
        <div className="md:hidden flex flex-col gap-14 mt-10">
          {STEPS.map((s) => (
            <div key={s.key} className="flex flex-col items-center gap-5">
              <PhoneFrame className="w-52"><StepStill step={s} /></PhoneFrame>
              <div className="text-center max-w-md">
                <p className="text-xs font-bold text-rust uppercase tracking-widest mb-1">{s.eyebrow}</p>
                <h3 className="font-bold text-ink text-lg mb-1">{s.title}</h3>
                <p className="text-sm text-ink/70 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: sticky phone, copy blocks scroll past at native speed */}
        <div className="hidden md:flex gap-16 mt-6">
          <div className="flex-1">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                ref={(el) => (markers.current[i] = el)}
                className={`min-h-[70vh] flex flex-col justify-center transition-opacity duration-300 ${active === i ? "opacity-100" : "opacity-40"}`}
              >
                <p className="text-xs font-bold text-rust uppercase tracking-widest mb-2">{s.eyebrow}</p>
                <h3 className="font-serif text-2xl lg:text-3xl text-ink mb-3">{s.title}</h3>
                <p className="text-ink/70 leading-relaxed max-w-md">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="flex-1 flex justify-center">
            <div className="sticky top-24 h-fit self-start" style={{ paddingTop: "10vh" }}>
              <div className="relative">
                <div className="absolute inset-0 scale-75 blur-3xl opacity-25 pointer-events-none rounded-full" style={{ background: "radial-gradient(circle, #B74217 0%, #4FA4A1 100%)" }} />
                <PhoneFrame className="relative">
                  <div className="relative w-full h-full">
                    {STEPS.map((s, i) => (
                      <div key={s.key} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: active === i ? 1 : 0 }}>
                        <StepStill step={s} />
                      </div>
                    ))}
                  </div>
                </PhoneFrame>
              </div>
              <p aria-live="polite" className="sr-only">Showing: {STEPS[active].title}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
