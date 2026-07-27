import { useState, useEffect, useRef } from "react";

// Shared layout + interactive nav for secondary pages
// (Support, Delete Account, Business, Privacy, Terms).

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-4">{title}</h2>
      <div className="flex flex-col gap-4 text-[#444] leading-relaxed">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5 list-none">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#B74217] flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const MAIN_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "For Businesses", href: "/business" },
  { label: "Support", href: "/support" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Delete Account", href: "/delete-account" },
];

function PageNav({ currentPath }: { currentPath: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const legalRef = useRef<HTMLDivElement>(null);

  // Close the legal dropdown on outside click / Escape
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (legalRef.current && !legalRef.current.contains(e.target as Node)) setLegalOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLegalOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const isActive = (href: string) => currentPath === href;
  const legalActive = LEGAL_LINKS.some((l) => l.href === currentPath);

  const linkClass = (active: boolean) =>
    `transition-colors ${active ? "text-[#B74217]" : "text-[#585858] hover:text-[#B74217]"}`;

  return (
    <header className="sticky top-0 z-50 bg-[#FAEFD1]/85 backdrop-blur-md border-b border-[#B74217]/10">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center">
          <img src="/barkfind-logo-rust.png" alt="BarkFind" className="h-8" />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold">
          {MAIN_LINKS.map((l) => (
            <a key={l.href} href={l.href} className={linkClass(isActive(l.href))}>
              {l.label}
            </a>
          ))}

          {/* Legal dropdown */}
          <div className="relative" ref={legalRef}>
            <button
              onClick={() => setLegalOpen((o) => !o)}
              className={`flex items-center gap-1 ${linkClass(legalActive)}`}
              aria-expanded={legalOpen}
              aria-haspopup="true"
            >
              Legal
              <svg
                className={`w-3.5 h-3.5 transition-transform ${legalOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {legalOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white border border-stone-100 shadow-lg py-2 z-50">
                {LEGAL_LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className={`block px-4 py-2 text-sm ${
                      isActive(l.href) ? "text-[#B74217] bg-[#FAEFD1]/60 font-semibold" : "text-[#585858] hover:bg-stone-50"
                    }`}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <a
            href="/#download"
            className="inline-flex items-center px-5 py-2.5 rounded-full bg-[#B74217] text-white text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-[#B74217]/30"
          >
            Start Free Trial
          </a>
        </nav>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-[#212121]"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile panel */}
      {menuOpen && (
        <div className="md:hidden bg-[#FAEFD1] border-t border-[#B74217]/10 px-6 py-4 flex flex-col gap-1 text-sm font-semibold">
          {MAIN_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`py-2 ${isActive(l.href) ? "text-[#B74217]" : "text-[#585858]"}`}
            >
              {l.label}
            </a>
          ))}
          <p className="pt-3 pb-1 text-xs uppercase tracking-widest text-[#B74217]/70 font-bold">Legal</p>
          {LEGAL_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`py-2 pl-3 ${isActive(l.href) ? "text-[#B74217]" : "text-[#585858]"}`}
            >
              {l.label}
            </a>
          ))}
          <a
            href="/#download"
            onClick={() => setMenuOpen(false)}
            className="mt-3 text-center px-5 py-2.5 rounded-full bg-[#B74217] text-white font-bold shadow-sm"
          >
            Start Free Trial
          </a>
        </div>
      )}
    </header>
  );
}

export default function PageShell({
  title,
  subtitle,
  meta,
  children,
  maxWidth = "max-w-3xl",
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <div className="min-h-screen font-sans bg-white text-[#212121]">
      <PageNav currentPath={currentPath} />

      {/* Hero strip */}
      <div className="bg-[#FAEFD1]">
        <div className={`${maxWidth} mx-auto px-6 py-14`}>
          <h1 className="font-serif text-4xl md:text-5xl text-[#1a1a1a] mb-3">{title}</h1>
          {subtitle && <p className="text-lg text-[#585858] max-w-2xl leading-relaxed">{subtitle}</p>}
          {meta && <p className="text-sm text-[#585858] font-semibold">{meta}</p>}
        </div>
      </div>

      {/* Body */}
      <main className={`${maxWidth} mx-auto px-6 py-14`}>{children}</main>

      {/* Footer */}
      <footer className="bg-[#1a1a1a] text-white/50 py-10">
        <div className={`${maxWidth} mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm`}>
          <img src="/barkfind-logo-white.png" alt="BarkFind" className="h-7 opacity-80" />
          <div className="flex flex-wrap justify-center gap-6">
            <a href="/" className="hover:text-white transition-colors">Home</a>
            <a href="/support" className="hover:text-white transition-colors">Support</a>
            <a href="/business" className="hover:text-white transition-colors">Business</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
            <a href="mailto:info@barkfind.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          <span className="text-xs whitespace-nowrap">© {new Date().getFullYear()} BarkFind</span>
        </div>
      </footer>
    </div>
  );
}
