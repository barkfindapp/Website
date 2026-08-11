import { useState } from "react";
import { useReducedMotion } from "./_shared";

// Points mechanics from the production schema. Do not invent.
const MAX = 50;
const TIERS = [
  { at: 10, reward: "25% off", sub: "your next monthly bill", note: "per rolling 90 days" },
  { at: 20, reward: "50% off", sub: "your next monthly bill", note: "per rolling 90 days" },
  { at: 50, reward: "1 year free", sub: "added to your plan", note: "lifetime · once" },
];

function PawMark({ className = "", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill={color} className={className} aria-hidden="true">
      <path d="M7.29 19.46C8.12 20.72 9.41 21.46 10.65 21.5C11.86 21.37 13.17 20.52 13.76 18.65C13.86 17.67 13.6 16.64 13.01 15.74C12.42 14.84 11.58 14.18 10.65 13.87C9.67 13.55 8.7 13.66 7.92 14.17C6.34 15.2 6.06 17.57 7.29 19.46ZM16.46 15.76C17.39 15.62 18.19 15.05 18.71 14.17C19.21 13.32 19.4 12.27 19.25 11.21C18.92 8.97 17.14 7.38 15.28 7.65C14.36 7.79 13.56 8.35 13.03 9.23C12.53 10.08 12.34 11.14 12.5 12.19C12.65 13.26 13.86 14.88 13.86 14.88C14.47 15.45 15.2 15.76 15.95 15.78C16.29 15.78 16.29 15.78 16.46 15.76ZM27.86 12.69C28.08 11.64 27.96 10.58 27.51 9.7C27.05 8.79 26.29 8.17 25.37 7.98C24.46 7.79 23.52 8.04 22.72 8.68C21.95 9.3 21.41 10.22 21.19 11.27C20.71 13.48 21.83 15.59 23.67 15.99C24 16.04 24.17 16.05 24.17 16.05C25.84 16.1 27.43 14.7 27.86 12.69ZM25.16 21.73C24.7 21.58 24.35 21.23 24.18 20.75C23.55 18.88 21.92 17.64 20.01 17.58C18.11 17.52 16.4 18.66 15.64 20.48C15.45 20.94 15.07 21.27 14.61 21.39C12.44 21.91 10.82 23.81 10.75 25.91C10.67 28.56 12.67 30.79 15.23 30.87C16.12 30.9 17.03 30.67 17.84 30.2C18.97 29.54 20.29 29.58 21.36 30.31C22.14 30.83 23.03 31.13 23.93 31.15C26.48 31.24 28.63 29.14 28.71 26.49C28.78 24.39 27.29 22.39 25.16 21.73ZM33.52 17.41C33.48 16.39 33.05 15.51 32.3 14.95C31.56 14.39 30.59 14.23 29.6 14.48C28.64 14.73 27.76 15.33 27.12 16.19C25.77 18 25.9 20.38 27.4 21.51C27.89 21.88 29.11 22.1 29.11 22.1C29.43 22.11 29.77 22.07 30.11 21.99C31.06 21.74 31.94 21.14 32.58 20.28C33.23 19.42 33.56 18.4 33.52 17.41Z" />
    </svg>
  );
}

export default function TierTrack() {
  const reduced = useReducedMotion();
  const [pts, setPts] = useState(0);
  const pct = (pts / MAX) * 100;

  return (
    <div className="rounded-2xl border border-stone-100 bg-white shadow-sm p-6 sm:p-8">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-ink">Drag to earn points</p>
        <p className="text-sm font-bold text-rust">{pts} {pts === 1 ? "point" : "points"}</p>
      </div>
      <p className="text-xs text-ink/60 mb-6">Slide along to see what each tier unlocks.</p>

      {/* Track */}
      <div className="relative h-3 mb-2">
        <div className="absolute inset-0 rounded-full bg-cream" />
        <div className="absolute inset-y-0 left-0 rounded-full bg-rust" style={{ width: `${pct}%`, transition: reduced ? undefined : "width 0.15s ease-out" }} />
        {TIERS.map((t) => (
          <div key={t.at} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${(t.at / MAX) * 100}%` }}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${pts >= t.at ? "bg-rust" : "bg-white border-2 border-stone-200"}`}>
              <PawMark className="w-3 h-3" color={pts >= t.at ? "#ffffff" : "#C9C1B4"} />
            </div>
          </div>
        ))}
        <input
          type="range"
          min={0}
          max={MAX}
          step={1}
          value={pts}
          onChange={(e) => setPts(Number(e.target.value))}
          aria-label="Points earned"
          aria-valuetext={`${pts} points`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <div className="flex justify-between text-[11px] text-ink/50 mb-8">
        <span>0</span><span>10</span><span>20</span><span>50</span>
      </div>

      {/* Tier cards light up as you pass them */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TIERS.map((t) => {
          const unlocked = pts >= t.at;
          return (
            <div
              key={t.at}
              className={`rounded-xl p-4 border text-center ${unlocked ? "bg-rust border-rust text-white" : "bg-white border-stone-100 text-ink"}`}
              style={{ transition: reduced ? undefined : "background-color 0.2s ease, color 0.2s ease" }}
              aria-current={unlocked}
            >
              <p className={`text-[11px] font-bold uppercase tracking-widest ${unlocked ? "text-white/70" : "text-ink/50"}`}>{t.at} points</p>
              <p className="font-serif text-xl mt-0.5">{t.reward}</p>
              <p className={`text-xs mt-0.5 ${unlocked ? "text-white/80" : "text-ink/60"}`}>{t.sub}</p>
              <p className={`text-[10px] mt-1 ${unlocked ? "text-white/60" : "text-ink/40"}`}>{t.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
