// Shared layout for secondary pages (Support, Delete Account, Business, legal).

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

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = "max-w-3xl",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="min-h-screen font-sans bg-white text-[#212121]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-[#FAEFD1]/80 backdrop-blur-md border-b border-[#B74217]/10">
        <div className={`${maxWidth} mx-auto px-6 h-16 flex items-center justify-between`}>
          <a href="/" className="flex items-center">
            <img src="/barkfind-logo-rust.png" alt="BarkFind" className="h-8" />
          </a>
          <a href="/" className="text-sm font-semibold text-[#585858] hover:text-[#B74217] transition-colors">
            ← Back to home
          </a>
        </div>
      </header>

      {/* Hero strip */}
      <div className="bg-[#FAEFD1]">
        <div className={`${maxWidth} mx-auto px-6 py-14`}>
          <h1 className="font-serif text-4xl md:text-5xl text-[#1a1a1a] mb-3">{title}</h1>
          {subtitle && <p className="text-lg text-[#585858] max-w-2xl leading-relaxed">{subtitle}</p>}
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
