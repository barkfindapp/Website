import { useEffect, useRef, useState } from "react";
import { PhoneFrame, AssetPlaceholder, useReducedMotion } from "./_shared";

// Flip to true once the screen recording is supplied at the paths below.
const HAS_VIDEO = false;
const VIDEO_WEBM = "/media/app-demo.webm";
const VIDEO_MP4 = "/media/app-demo.mp4";
const VIDEO_POSTER = "/media/app-demo-poster.jpg";

export default function PhoneDemo() {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // Only start playback when at least 50% in view; pause when it leaves.
  useEffect(() => {
    if (!HAS_VIDEO || reduced) return;
    const el = sectionRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !paused) vid.play().catch(() => {});
        else vid.pause();
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, paused]);

  const togglePause = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setPaused(false);
    } else {
      vid.pause();
      setPaused(true);
    }
  };

  return (
    <section ref={sectionRef} className="py-24 overflow-hidden" style={{ background: "#2E2820" }}>
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center gap-12 md:gap-16">
        <div className="flex-1 text-center md:text-left order-2 md:order-1">
          <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: "#E8956A" }}>See it in action</p>
          <h2 className="font-serif text-3xl md:text-4xl text-white mb-4 leading-tight">
            The whole walk, sorted in a few taps
          </h2>
          <p className="text-lg text-white/60 leading-relaxed max-w-md mx-auto md:mx-0">
            Search a spot, check it suits your dog, and set off. This is BarkFind on a normal Saturday.
          </p>
        </div>

        <div className="flex-1 flex justify-center relative order-1 md:order-2">
          <div className="relative">
            <PhoneFrame>
              {HAS_VIDEO && !reduced ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  poster={VIDEO_POSTER}
                  muted
                  loop
                  playsInline
                  preload="none"
                  width={1080}
                  height={2340}
                >
                  <source src={VIDEO_WEBM} type="video/webm" />
                  <source src={VIDEO_MP4} type="video/mp4" />
                </video>
              ) : HAS_VIDEO && reduced ? (
                <img src={VIDEO_POSTER} alt="BarkFind app in use" className="w-full h-full object-cover" width={1080} height={2340} loading="lazy" />
              ) : (
                <AssetPlaceholder label="App demo clip (8-12s screen recording)" rounded="rounded-none" />
              )}
            </PhoneFrame>

            {HAS_VIDEO && !reduced && (
              <button
                onClick={togglePause}
                className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-ink/70 text-white flex items-center justify-center backdrop-blur-sm"
                aria-label={paused ? "Play demo video" : "Pause demo video"}
              >
                {paused ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
