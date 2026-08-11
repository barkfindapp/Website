import { useEffect, useRef, useState } from "react";

// Honour prefers-reduced-motion everywhere.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

// IntersectionObserver-based in-view flag. No scroll-position listeners.
export function useInView<T extends HTMLElement>(threshold = 0.5, once = false) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) io.disconnect();
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);
  return [ref, inView] as const;
}

// Clean CSS/SVG device bezel, no stock photo. Screen content is the child.
export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: 264 }}>
      <div className="relative rounded-[2.6rem] bg-[#111316] p-[9px] shadow-2xl" style={{ aspectRatio: "118 / 236" }}>
        <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-white">
          {children}
          {/* Dynamic island */}
          <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-[34%] h-[16px] rounded-full bg-black/90" />
        </div>
      </div>
    </div>
  );
}

// Clearly-marked placeholder for missing assets (screen recordings, stills, photos).
// Never a stock image. Renders a labelled cream panel so it reads as "asset pending".
export function AssetPlaceholder({ label, ratio = "9 / 19.5", rounded = "rounded-2xl" }: { label: string; ratio?: string; rounded?: string }) {
  return (
    <div
      className={`w-full h-full flex items-center justify-center text-center bg-cream ${rounded}`}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={`Placeholder: ${label}`}
    >
      <div className="px-4">
        <svg className="w-8 h-8 mx-auto mb-2 text-rust/50" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4M10 8l4 2.5L10 13V8z" />
        </svg>
        <p className="text-[11px] font-bold uppercase tracking-widest text-rust/60">Placeholder</p>
        <p className="text-xs text-ink/50 mt-1">{label}</p>
      </div>
    </div>
  );
}
