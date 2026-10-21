import { useEffect, useState } from "react";

// Seasonal homepage banner pointing visitors at the Bonfire Night news.
//
// TEMPORARY: it hides itself from 11 November 2026 onwards, so it stops
// showing on its own. After that date, delete this file and remove the
// <BonfireBanner /> mount from LandingPage.tsx.
const HIDE_FROM = new Date(2026, 10, 11).getTime(); // local midnight, 11 Nov 2026
const DISMISS_KEY = "bf-bonfire-2026";
const NEWS_URL = "/discover?q=fireworks";

export default function BonfireBanner() {
  // Mounted controls presence in the DOM; shown drives the slide-in transition.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (Date.now() >= HIDE_FROM) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* no storage (private mode): still show, just do not remember */
    }
    // A short delay so it slides in after the page has settled.
    const t = setTimeout(() => {
      setMounted(true);
      requestAnimationFrame(() => setShown(true));
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setShown(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    // Remove from the DOM once the slide-out has finished.
    setTimeout(() => setMounted(false), 300);
  }

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-label="Bonfire Night with your dog"
      className={`fixed bottom-4 left-4 right-4 z-[60] sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="relative rounded-2xl border border-[#EDE6D6] bg-white p-5 pr-10 shadow-xl shadow-black/10">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[#8a857c] transition-colors hover:bg-[#F5F1E9] hover:text-[#1a1a1a]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FAEFD1]" aria-hidden="true">
            <svg className="h-5 w-5 text-[#B74217]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c.6 1.9.3 3.3-.8 4.6-1 1.2-1.5 2.3-1.3 3.6.9-.5 1.6-1.2 2.1-2.2.9 1 1.4 2.1 1.4 3.4a4.4 4.4 0 11-5.8 1.2c.1 1 .5 1.8 1.2 2.4-.2-1.6.3-3 1.5-4.4C8.3 12.4 7 13.9 7 16a5 5 0 1010 0c0-3-1.4-5.2-2.9-6.9C12.6 7.4 11.8 5.3 12 2z" />
            </svg>
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#B74217]">Bonfire Night</p>
            <h2 className="mt-0.5 font-serif text-lg leading-snug text-[#1a1a1a]">Dreading the fireworks?</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#585858]">
              We have rounded up dog-friendly places and tips to help you and your dog through it.
            </p>
            <a
              href={NEWS_URL}
              onClick={dismiss}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-[#B74217] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#333333]"
            >
              See Bonfire Night spots
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
