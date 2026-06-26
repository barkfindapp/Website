import { useState, useEffect } from "react";

// TODO: replace with the real App Store listing URL once live.
const APP_STORE_URL = "#download";

// ─── Nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#FAEFD1]/80 backdrop-blur-md border-b border-[#B74217]/10">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center">
          <img src="/barkfind-logo-rust.png" alt="BarkFind" className="h-8" />
        </a>

        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#585858]">
          <a href="#mylo" className="hover:text-[#B74217] transition-colors">Mylo AI</a>
          <a href="#features" className="hover:text-[#B74217] transition-colors">Features</a>
          <a href="#pricing" className="hover:text-[#B74217] transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-[#B74217] transition-colors">FAQ</a>
        </nav>

        <a
          href="#download"
          className="hidden md:inline-flex items-center px-5 py-2.5 rounded-full bg-[#B74217] text-white text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-[#B74217]/30"
        >
          Start Free Trial
        </a>

        <button
          className="md:hidden p-2 text-[#212121]"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
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

      {menuOpen && (
        <div className="md:hidden bg-[#FAEFD1] border-t border-[#B74217]/10 px-6 py-4 flex flex-col gap-4 text-sm font-semibold">
          <a href="#mylo" onClick={() => setMenuOpen(false)} className="text-[#585858]">Mylo AI</a>
          <a href="#features" onClick={() => setMenuOpen(false)} className="text-[#585858]">Features</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-[#585858]">Pricing</a>
          <a href="#faq" onClick={() => setMenuOpen(false)} className="text-[#585858]">FAQ</a>
          <a
            href="#download"
            onClick={() => setMenuOpen(false)}
            className="text-center px-5 py-2 rounded-full bg-[#B74217] text-white font-bold shadow-sm"
          >
            Start Free Trial
          </a>
        </div>
      )}
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 60% 40%, #f5e6c8 0%, #FAEFD1 50%, #f0e8d4 100%)",
      }}
    >
      {/* Subtle decorative circle */}
      <div
        className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-30 pointer-events-none"
        style={{ background: "radial-gradient(circle, #B74217 0%, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, #4FA4A1 0%, transparent 70%)" }}
      />

      <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-32 flex flex-col md:flex-row items-center gap-14">
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 text-[#B74217] text-xs font-bold mb-7 border border-[#B74217]/20 shadow-sm backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B74217] animate-pulse" />
            Now live on iOS
          </div>

          <h1 className="font-serif text-4xl md:text-5xl lg:text-[3.75rem] text-[#1a1a1a] leading-[1.1] mb-5 tracking-tight">
            Be the first to explore<br />
            <span className="text-[#B74217] italic">every dog-friendly place.</span>
          </h1>

          <p className="text-lg text-[#585858] mb-9 max-w-xl mx-auto md:mx-0 leading-relaxed">
            BarkFind is the community-powered map that helps you and your dog discover cafes, parks, pubs, and more — all reviewed by people who actually bring their dogs. Start your 14-day free trial today.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
            <a
              href="#download"
              className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#B74217] text-white font-bold text-base hover:opacity-90 transition-all shadow-lg shadow-[#B74217]/25 text-center"
            >
              Start your 14-day free trial
            </a>
            <a
              href="#features"
              className="w-full sm:w-auto px-8 py-3.5 rounded-full border-2 border-[#B74217]/30 text-[#B74217] font-bold text-base hover:border-[#B74217] hover:bg-[#B74217]/5 transition-all text-center"
            >
              See how it works
            </a>
          </div>

          <div className="mt-8 flex items-center gap-4 justify-center md:justify-start text-sm text-[#585858]">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#4FA4A1]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              iOS First
            </span>
            <span className="w-1 h-1 rounded-full bg-[#585858]/40" />
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#4FA4A1]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Free to download
            </span>
            <span className="w-1 h-1 rounded-full bg-[#585858]/40" />
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#4FA4A1]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              14-day free trial — full access
            </span>
          </div>
        </div>

        <div className="flex-shrink-0 relative">
          {/* Glow behind mockup */}
          <div
            className="absolute inset-0 scale-75 translate-y-8 blur-3xl opacity-40 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, #B74217 0%, #4FA4A1 100%)" }}
          />
          <img
            src="/onboarding-mockup-1.png"
            alt="BarkFind app screenshot"
            className="relative w-64 md:w-72 lg:w-80 drop-shadow-2xl"
          />
        </div>
      </div>

      {/* Wave divider */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
        <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0 40L60 34C120 28 240 16 360 13.3C480 10.7 600 17.3 720 21.3C840 25.3 960 26.7 1080 24C1200 21.3 1320 14.7 1380 11.3L1440 8V40H1380C1320 40 1200 40 1080 40C960 40 840 40 720 40C600 40 480 40 360 40C240 40 120 40 60 40H0Z" fill="white" />
        </svg>
      </div>
    </section>
  );
}

// ─── App Showcase ─────────────────────────────────────────────────────────────

// Plain flat screenshot with a soft drop shadow (no CSS device frame).
function PhoneShot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={`drop-shadow-2xl ${className}`} />;
}


const SCREENS = [
  {
    id: "map",
    label: "Discover",
    title: "Find every dog-friendly spot near you",
    description: "Interactive map with custom paw pins. Switch between map and list view. Filter by cafes, parks, pubs, vets, and more.",
    image: "/screen-map.png",
  },
  {
    id: "explore",
    label: "Explore",
    title: "Browse locations at a glance",
    description: "Rich listing cards with real photos, dual ratings (BarkFind + Google), distance, and verified amenity tags — all in one view.",
    image: "/screen-explore.png",
  },
  {
    id: "saved",
    label: "Save",
    title: "Build your go-to list",
    description: "Save your favourite spots and access them instantly. Plan walks, days out, and trips around places you trust.",
    image: "/screen-saved.png",
  },
  {
    id: "reviews",
    label: "Reviews",
    title: "Reviews from real dog owners",
    description: "Paw ratings, honest written reviews, and real photos from dog owners. Know exactly what to expect before you arrive.",
    image: "/screen-reviews.png",
  },
  {
    id: "dogprofile",
    label: "Dog Profile",
    title: "A profile built around your dog",
    description: "Add breed, age, weight, and temperament. Premium members unlock advanced fields — behaviour with humans, reaction to wildlife, noise sensitivity, and more.",
    image: "/screen-dogprofile.png",
  },
];

function AppShowcase() {
  const initialTab = (() => {
    const id = new URLSearchParams(window.location.search).get("tab");
    const idx = SCREENS.findIndex((s) => s.id === id);
    return idx >= 0 ? idx : 0;
  })();
  const [active, setActive] = useState(initialTab);

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-sm font-bold text-[#B74217] uppercase tracking-widest mb-3">The App</p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a] mb-5">
            See it in action
          </h2>
          <p className="text-lg text-[#585858] max-w-xl mx-auto">
            Built for dog owners. Designed to make every outing easier.
          </p>
        </div>

        {/* ── Mobile: compact pill tabs on top, phone always visible ── */}
        <div className="lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-6 px-6 mb-7 snap-x">
            {SCREENS.map((screen, i) => (
              <button
                key={screen.id}
                onClick={() => setActive(i)}
                className={`snap-start whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all flex-shrink-0 ${
                  active === i
                    ? "bg-[#B74217] text-white shadow-sm"
                    : "bg-[#FAEFD1] text-[#585858]"
                }`}
              >
                {screen.label}
              </button>
            ))}
          </div>

          <div className="relative flex justify-center">
            <div
              className="absolute inset-0 scale-75 blur-3xl opacity-30 pointer-events-none"
              style={{ background: "radial-gradient(circle, #B74217 0%, #4FA4A1 100%)" }}
            />
            <PhoneShot key={active} src={SCREENS[active].image} alt={SCREENS[active].title} className="relative w-60 fade-in" />
          </div>

          <div className="text-center mt-7 max-w-sm mx-auto">
            <h3 className="font-bold text-[#1a1a1a] text-lg mb-2">{SCREENS[active].title}</h3>
            <p className="text-sm text-[#585858] leading-relaxed">{SCREENS[active].description}</p>
          </div>
        </div>

        {/* ── Desktop: tabs left, phone right ── */}
        <div className="hidden lg:flex flex-row items-center gap-16">
          <div className="flex-1 max-w-lg">
            <div className="flex flex-col gap-3">
              {SCREENS.map((screen, i) => (
                <button
                  key={screen.id}
                  onClick={() => setActive(i)}
                  className={`text-left rounded-2xl px-6 py-5 transition-all border ${
                    active === i
                      ? "bg-[#FAEFD1] border-[#B74217]/20 shadow-sm"
                      : "bg-white border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className={`text-xs font-bold uppercase tracking-widest transition-colors ${
                        active === i ? "text-[#B74217]" : "text-[#585858]"
                      }`}
                    >
                      {screen.label}
                    </span>
                    {active === i && <span className="w-1.5 h-1.5 rounded-full bg-[#B74217]" />}
                  </div>
                  <p className={`font-bold text-base mb-1 ${active === i ? "text-[#1a1a1a]" : "text-[#585858]"}`}>
                    {screen.title}
                  </p>
                  {active === i && (
                    <p className="text-sm text-[#585858] leading-relaxed mt-2">{screen.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 flex justify-center relative">
            <div
              className="absolute inset-0 scale-75 blur-3xl opacity-30 pointer-events-none"
              style={{ background: "radial-gradient(circle, #B74217 0%, #4FA4A1 100%)" }}
            />
            <PhoneShot key={active} src={SCREENS[active].image} alt={SCREENS[active].title} className="relative w-72 fade-in" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.25s ease; }
      `}</style>
    </section>
  );
}

// ─── Mylo AI Section ──────────────────────────────────────────────────────────

const MYLO_SHOTS = [
  { image: "/mylo-prompts.png", caption: "Tell Mylo what you're after" },
  { image: "/mylo-chat.png", caption: "Mylo sniffs out the best matches" },
];

const MYLO_POINTS = [
  {
    title: "Talk to it like a friend, not a search box",
    body: "No forms, no filter toggles. Say “a quiet pub where my Great Dane can stretch out with a water bowl” and Mylo just gets it.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
      </svg>
    ),
  },
  {
    title: "It thinks like a dog owner",
    body: "Off-lead space to run, fresh water, room for big dogs, indoor seating when it rains, and calm corners for nervous, reactive, or senior pups.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    title: "Real places, real ratings — never made up",
    body: "Every suggestion comes from BarkFind's directory of genuinely dog-friendly places, each rated by real owners. Mylo never invents a name, address, or rating.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "It asks the right question, then gets out of your way",
    body: "If your request is broad, Mylo asks one quick clarifying question to narrow it down — then points you to specific places by name.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const MYLO_PROMPTS = [
  "Find a calm café where my anxious rescue can settle, with water and space away from the door.",
  "Somewhere my spaniel can run off-lead near me.",
  "A lively pub with a beer garden that's cool with dogs inside too.",
  "Dog-friendly brunch, not too pricey.",
];

function MyloAvatar({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-full bg-[#B74217] flex items-center justify-center ${className}`}>
      <img src="/barkfind-paw-logo.png" alt="" className="w-1/2 h-1/2 brightness-0 invert" />
    </div>
  );
}

function MyloCarousel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % MYLO_SHOTS.length), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-5">
      <div className="relative">
        {/* Glow */}
        <div
          className="absolute inset-0 scale-90 blur-3xl opacity-30 pointer-events-none rounded-full"
          style={{ background: "radial-gradient(circle, #B74217 0%, #4FA4A1 100%)" }}
        />
        <div className="relative w-64 sm:w-72" style={{ aspectRatio: "1570 / 2932" }}>
          {MYLO_SHOTS.map((shot, i) => (
            <img
              key={shot.image}
              src={shot.image}
              alt={shot.caption}
              className="absolute inset-0 w-full drop-shadow-2xl transition-opacity duration-700"
              style={{ opacity: i === idx ? 1 : 0 }}
            />
          ))}
        </div>
      </div>

      {/* Caption + dots */}
      <div className="flex flex-col items-center gap-3 relative z-10">
        <p className="text-sm font-semibold text-[#585858] min-h-[20px] text-center">
          {MYLO_SHOTS[idx].caption}
        </p>
        <div className="flex gap-2">
          {MYLO_SHOTS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Show screenshot ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-[#B74217]" : "w-2 bg-[#B74217]/25"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Mylo() {
  return (
    <section
      id="mylo"
      className="py-24 overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, #FAEFD1 0%, #f5e8c8 100%)" }}
    >
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle, #B74217 0%, transparent 70%)" }} />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#B74217]/10 text-[#B74217] text-xs font-bold mb-5 border border-[#B74217]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B74217] animate-pulse" />
            New · AI Assistant
          </div>
          <div className="flex items-center justify-center gap-3 mb-5">
            <MyloAvatar className="w-12 h-12" />
            <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a]">
              Meet Mylo
            </h2>
          </div>
          <p className="text-lg md:text-xl text-[#585858] max-w-2xl mx-auto leading-relaxed">
            Mylo turns <span className="text-[#1a1a1a] font-semibold">“where can I take my dog?”</span> into a simple conversation — and answers it with real, dog-owner-rated places.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Carousel */}
          <div className="flex-1 flex justify-center w-full">
            <MyloCarousel />
          </div>

          {/* Copy */}
          <div className="flex-1 w-full">
            <div className="flex flex-col gap-5 mb-8">
              {MYLO_POINTS.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-[#B74217] flex-shrink-0">
                    {p.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-[#1a1a1a] text-base mb-1">{p.title}</h3>
                    <p className="text-sm text-[#585858] leading-relaxed">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Example prompts */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-[#B74217]/10">
              <p className="text-xs font-bold text-[#585858] uppercase tracking-widest mb-3">Try saying things like…</p>
              <div className="flex flex-col gap-2">
                {MYLO_PROMPTS.map((prompt) => (
                  <div key={prompt} className="flex items-start gap-2.5 bg-[#FAEFD1] rounded-xl px-3.5 py-2.5">
                    <MyloAvatar className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-[#1a1a1a] italic leading-snug">“{prompt}”</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust Bar ────────────────────────────────────────────────────────────────

function TrustBar() {
  const items = [
    "Community-powered reviews",
    "Earn rewards for reviewing",
    "Cafes, parks, pubs & more",
    "iOS — Android coming soon",
  ];
  return (
    <div className="bg-white py-5 border-b border-stone-100">
      <div className="max-w-5xl mx-auto px-6 flex flex-wrap justify-center items-center gap-x-8 gap-y-2">
        {items.map((item, i) => (
          <span key={item} className="flex items-center gap-2 text-sm font-semibold text-[#585858]">
            {i > 0 && <span className="hidden sm:inline text-stone-200 mr-4">·</span>}
            <svg className="w-4 h-4 text-[#4FA4A1] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: "Mylo, your AI guide",
    description: "Just tell Mylo what you and your dog need in plain English — “a quiet pub with a water bowl” — and it finds the right spots from BarkFind's rated directory.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
      </svg>
    ),
  },
  {
    title: "Everything on One Map",
    description: "Stop juggling multiple apps. BarkFind consolidates dog-friendly cafes, parks, restaurants, vets, groomers, and more onto a single interactive map.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    title: "Advanced Filters",
    description: "Filter by off-lead areas, water access, indoor seating, and pet-fee transparency. Find exactly what you and your dog need — no guesswork.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
      </svg>
    ),
  },
  {
    title: "Paw Ratings & Verified Reviews",
    description: "Every location is rated with paws (1–5) by real dog owners. Photos, verified amenities, and honest reviews you can actually trust.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    title: "Real-Time Nearby Alerts",
    description: "Get notified when you're near a dog-friendly spot you haven't tried. Discover hidden gems on every walk.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    title: "Dog Profiles",
    description: "Add your dog's breed, size, and temperament so BarkFind can personalise recommendations to suit your specific dog.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    title: "Community Photos",
    description: "See real photos from dog owners before you go. Know exactly what to expect — no more turning up to a damp corner outside.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "Earn Rewards for Reviewing",
    description: "Leave reviews and unlock exclusive discounts. 10 reviews gets you 25% off, 20 reviews 50% off, and 50 reviews earns you a full year free.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
    ),
  },
  {
    title: "Exclusive In-App Promotions",
    description: "Unlock special offers and discounts from nearby dog-friendly locations and brands — treats, meals, and perks you won't find anywhere else.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5.172 5.172a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 9V4a1 1 0 011-1z" />
      </svg>
    ),
  },
];

function Features() {
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-bold text-[#B74217] uppercase tracking-widest mb-3">Why BarkFind</p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a] mb-5 leading-tight">
            Tired of Googling<br />"dog-friendly near me"?
          </h2>
          <p className="text-lg text-[#585858] max-w-2xl mx-auto leading-relaxed">
            BarkFind gives you community-backed recommendations — not outdated listings that call a damp bench outside "dog-friendly".
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group bg-white rounded-2xl p-7 flex flex-col gap-4 border border-stone-100 shadow-sm shadow-stone-100 hover:shadow-md hover:shadow-stone-200 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="w-11 h-11 rounded-xl bg-[#FAEFD1] flex items-center justify-center text-[#B74217] flex-shrink-0">
                {f.icon}
              </div>
              <div>
                <h3 className="font-bold text-[#1a1a1a] text-base mb-1.5">{f.title}</h3>
                <p className="text-sm text-[#585858] leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Rewards Section ──────────────────────────────────────────────────────────

// Brand paw mark (matches in-app rating icon)
function PawMark({ className = "", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill={color} className={className} aria-hidden="true">
      <path d="M7.29239 19.4593C8.11648 20.724 9.40644 21.4576 10.6485 21.4978C11.2588 21.5175 11.8582 21.3693 12.3828 21.0295C13.167 20.5196 13.6537 19.6758 13.7571 18.652C13.8591 17.6714 13.5952 16.6357 13.0081 15.7355C12.4209 14.8353 11.5826 14.1757 10.6464 13.8698C9.66742 13.5516 8.69637 13.6553 7.91763 14.1654C6.33819 15.1955 6.05616 17.5651 7.29239 19.4593Z"/>
      <path d="M16.4619 15.7553C17.3854 15.6176 18.1874 15.0543 18.708 14.1683C19.2112 13.3196 19.4019 12.2715 19.2471 11.2069C18.9192 8.97445 17.1434 7.38172 15.2804 7.65127C14.3569 7.789 13.5602 8.35251 13.0344 9.23292C12.5313 10.0816 12.3404 11.1351 12.4954 12.1942C12.6502 13.2588 13.133 14.2097 13.8573 14.8818C14.4716 15.4477 15.2022 15.7579 15.9474 15.7819C16.1202 15.7875 16.2936 15.7769 16.4619 15.7553Z"/>
      <path d="M27.8596 12.6908C28.0826 11.6438 27.9602 10.5803 27.5129 9.70083C27.045 8.78829 26.2864 8.17451 25.3738 7.97742C24.4609 7.78573 23.5176 8.03635 22.7183 8.68086C21.952 9.30482 21.4088 10.2225 21.1857 11.2695C20.7144 13.4761 21.8298 15.5935 23.666 15.9881C23.8379 16.0207 24.0048 16.0423 24.1722 16.0477C25.8409 16.1016 27.4324 14.6988 27.8596 12.6908Z"/>
      <path d="M25.1617 21.7288C24.7014 21.5842 24.3454 21.2267 24.1824 20.7511C23.5508 18.8818 21.9151 17.6396 20.0141 17.5781C18.1078 17.5165 16.3951 18.6559 15.6443 20.4751C15.4507 20.9446 15.0725 21.2729 14.6092 21.3877C12.4408 21.9069 10.8223 23.8115 10.7544 25.9123C10.6687 28.5639 12.6726 30.7911 15.227 30.8737C16.1235 30.9027 17.0285 30.667 17.8439 30.196C18.9679 29.5404 20.2856 29.583 21.3649 30.3099C22.1427 30.8324 23.0307 31.126 23.9271 31.1549C26.4815 31.2375 28.6251 29.1444 28.7109 26.4928C28.7789 24.3866 27.2866 22.3868 25.1617 21.7288Z"/>
      <path d="M33.5237 17.4148C33.4813 16.3863 33.05 15.5127 32.3004 14.9533C31.5562 14.3941 30.5939 14.2278 29.5964 14.4821C28.6424 14.7269 27.7579 15.3309 27.1192 16.1914C25.7686 18.002 25.897 20.3849 27.4012 21.5147C27.8921 21.882 28.4804 22.0794 29.1069 22.0996C29.4309 22.1101 29.7673 22.0723 30.1053 21.9859C31.0646 21.7412 31.9437 21.1372 32.5824 20.2766C33.2265 19.4162 33.5621 18.3999 33.5237 17.4148Z"/>
    </svg>
  );
}

const REWARDS = [
  {
    reviews: 10,
    reward: "25% off",
    detail: "your next bill",
    icon: (
      <div className="w-9 h-9 rounded-full bg-[#4FA4A1]/10 flex items-center justify-center flex-shrink-0">
        <PawMark className="w-5 h-5" color="#4FA4A1" />
      </div>
    ),
  },
  {
    reviews: 20,
    reward: "50% off",
    detail: "your next bill",
    icon: (
      <div className="w-9 h-9 rounded-full bg-[#4FA4A1]/15 flex items-center justify-center flex-shrink-0">
        <PawMark className="w-5 h-5" color="#3d8a87" />
      </div>
    ),
  },
  {
    reviews: 50,
    reward: "1 Year Free",
    detail: "on us",
    highlight: true,
    icon: (
      <div className="w-9 h-9 rounded-full bg-[#B74217] flex items-center justify-center flex-shrink-0">
        {/* Crown */}
        <svg className="w-[18px] h-[18px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 8.5l3.2 2.4a.75.75 0 0 0 1.13-.27L9.9 5.4a.75.75 0 0 1 1.34 0l2.57 5.23a.75.75 0 0 0 1.13.27L18.99 8.5a.75.75 0 0 1 1.19.74l-1.2 6.86a1 1 0 0 1-.99.83H6.01a1 1 0 0 1-.99-.83L3.82 9.24A.75.75 0 0 1 5 8.5z"/>
          <rect x="5.5" y="18" width="13" height="2.2" rx="1" />
        </svg>
      </div>
    ),
  },
];

function Rewards() {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

          {/* Left — copy */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#4FA4A1]/10 text-[#4FA4A1] text-xs font-bold mb-5 border border-[#4FA4A1]/20">
              <PawMark className="w-3.5 h-3.5" color="#4FA4A1" />
              Upcoming Treats
            </div>
            <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a] mb-5 leading-tight">
              Review places.<br />
              <span className="text-[#4FA4A1]">Earn real rewards.</span>
            </h2>
            <p className="text-lg text-[#585858] mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
              Every review you leave helps the BarkFind community find great spots. And the more you contribute, the more you save — all the way up to a full year free.
            </p>
            <p className="text-sm text-[#585858] bg-stone-50 rounded-xl px-4 py-3 inline-block border border-stone-100">
              Once you hit a milestone, tap <strong className="text-[#1a1a1a]">Redeem</strong> in the app to get your unique promo code. Discounts apply to your next billing cycle.
            </p>
          </div>

          {/* Right — milestone cards */}
          <div className="flex-1 w-full max-w-md mx-auto lg:mx-0">
            {/* Progress bar mockup */}
            <div className="rounded-2xl border border-stone-100 shadow-sm overflow-hidden mb-4">
              <div
                className="px-6 py-5"
                style={{ background: "linear-gradient(135deg, #4FA4A1 0%, #3d8a87 100%)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-bold text-base">Upcoming Treats</span>
                </div>
                <div className="flex items-center justify-between text-white/70 text-xs mb-2">
                  <span>0 reviews</span>
                  <span>10 to go</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full w-0 bg-white rounded-full" />
                </div>
              </div>

              <div className="divide-y divide-stone-100">
                {REWARDS.map((r) => (
                  <div
                    key={r.reviews}
                    className={`flex items-center justify-between px-6 py-4 ${r.highlight ? "bg-[#FAEFD1]/40" : "bg-white"}`}
                  >
                    <div className="flex items-center gap-3">
                      {r.icon}
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a1a]">
                          {r.reviews} Reviews
                          <span className="mx-2 text-[#4FA4A1]">→</span>
                          <span className={r.highlight ? "text-[#B74217]" : "text-[#1a1a1a]"}>{r.reward}</span>
                        </p>
                        <p className="text-xs text-[#585858]">{r.detail}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#585858] bg-stone-100 px-2.5 py-1 rounded-full">
                      Locked
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-center text-xs text-[#585858]">Discounts apply to monthly or annual subscriptions</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    number: "01",
    title: "Download & start your free trial",
    description: "Get BarkFind on iOS and unlock everything free for 14 days — no card required.",
  },
  {
    number: "02",
    title: "Add your dog",
    description: "Set up your dog's profile in under a minute so Mylo can tailor recommendations to your pup.",
  },
  {
    number: "03",
    title: "Explore & review",
    description: "Discover dog-friendly spots near you, save your favourites, and share reviews with the community.",
  },
];

function HowItWorks() {
  return (
    <section
      className="py-24 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #FAEFD1 0%, #f5e8c8 100%)" }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-bold text-[#B74217] uppercase tracking-widest mb-3">Getting Started</p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a] mb-5">How it works</h2>
          <p className="text-lg text-[#585858] max-w-xl mx-auto">Getting started takes less than two minutes.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
          {/* Connector line on desktop */}
          <div className="hidden md:block absolute top-10 left-[calc(16.7%+1rem)] right-[calc(16.7%+1rem)] h-px bg-[#B74217]/20" />

          {STEPS.map((step) => (
            <div key={step.number} className="flex flex-col items-center text-center gap-4 relative">
              <div className="w-16 h-16 rounded-full bg-white shadow-md shadow-[#B74217]/10 flex items-center justify-center flex-shrink-0 relative z-10">
                <span className="font-serif text-xl font-bold text-[#B74217]">{step.number}</span>
              </div>
              <div>
                <h3 className="font-bold text-[#1a1a1a] text-lg mb-2">{step.title}</h3>
                <p className="text-[#585858] text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const SHARED_FEATURES = [
  "Full access to all BarkFind features",
  "Interactive map with paw-pin locations",
  "Advanced filters (off-lead, water access & more)",
  "Unlimited saved favourites",
  "Dog profile & personalised recommendations",
  "Community reviews, photos & paw ratings",
  "Real-time nearby alerts",
];

const PLANS = [
  {
    name: "Monthly",
    price: "£4.99",
    period: "per month",
    description: "Full access, cancel anytime.",
    highlight: false,
    badge: null,
    saving: null,
    features: [
      ...SHARED_FEATURES.map((text) => ({ text, strong: false })),
      { text: "10 Mylo AI searches per day", strong: true },
      { text: "Includes occasional sponsored places", strong: true },
    ],
  },
  {
    name: "Annual",
    price: "£39.99",
    period: "per year",
    description: "Best value — just £3.33/month.",
    highlight: true,
    badge: "Save 33%",
    saving: "~4 months free",
    features: [
      ...SHARED_FEATURES.map((text) => ({ text, strong: false })),
      { text: "Unlimited Mylo AI searches", strong: true },
      { text: "Ad-free — turn off sponsored content", strong: true },
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-sm font-bold text-[#B74217] uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a] mb-5">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-[#585858] max-w-xl mx-auto">Try the full app free for 14 days — no credit card required.</p>
        </div>

        {/* Trial banner */}
        <div className="rounded-2xl bg-[#FAEFD1] border border-[#B74217]/15 p-6 mb-8 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-full bg-[#B74217] flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-[#1a1a1a] text-base">14-day free trial — full access, no restrictions</p>
            <p className="text-sm text-[#585858] mt-0.5">Every feature unlocked from day one. After your trial, choose a plan to keep exploring.</p>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center mb-10">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 flex flex-col gap-6 relative transition-all ${
                plan.highlight
                  ? "bg-[#B74217] text-white shadow-2xl shadow-[#B74217]/30 md:scale-105"
                  : "bg-white border border-stone-100 shadow-sm shadow-stone-100"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#4FA4A1] text-white text-xs font-bold whitespace-nowrap shadow-sm">
                  {plan.badge}
                </span>
              )}
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${plan.highlight ? "text-white/60" : "text-[#585858]"}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-1">
                  <span className={`text-4xl font-serif font-bold ${plan.highlight ? "text-white" : "text-[#1a1a1a]"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm mb-1.5 ${plan.highlight ? "text-white/60" : "text-[#585858]"}`}>
                    /{plan.period}
                  </span>
                </div>
                <p className={`text-sm ${plan.highlight ? "text-white/75" : "text-[#585858]"}`}>
                  {plan.description}
                </p>
                {plan.saving && (
                  <span className={`inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full ${plan.highlight ? "bg-white/20 text-white" : "bg-[#4FA4A1]/10 text-[#4FA4A1]"}`}>
                    {plan.saving}
                  </span>
                )}
              </div>

              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2.5 text-sm">
                    <svg
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlight ? "text-white" : "text-[#4FA4A1]"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span
                      className={`${f.strong ? "font-bold" : ""} ${plan.highlight ? "text-white/90" : "text-[#1a1a1a]"}`}
                    >
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href="#download"
                className={`text-center px-5 py-3 rounded-full font-bold text-sm transition-all ${
                  plan.highlight
                    ? "bg-white text-[#B74217] hover:bg-[#FAEFD1] shadow-md"
                    : "bg-[#B74217] text-white hover:opacity-90 shadow-sm shadow-[#B74217]/20"
                }`}
              >
                Start free trial
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-[#585858] mt-4">No credit card required to start your trial · Cancel any time</p>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: "Finally an app that actually helps me plan walks with my dog. I've discovered three new cafes in my area that I'd walked past for years without knowing they were dog-friendly.",
    author: "Sarah M.",
    role: "Labrador owner, London",
    initial: "S",
  },
  {
    quote: "The paw rating system is genius. I can tell at a glance whether a place is genuinely welcoming to dogs or just tolerates them. Made our last holiday trip so much easier.",
    author: "James R.",
    role: "Golden Retriever owner, Edinburgh",
    initial: "J",
  },
  {
    quote: "I love that other dog owners leave photos. You can see exactly what the space looks like — no more turning up to a 'dog-friendly' pub that means a damp corner outside.",
    author: "Priya K.",
    role: "Dachshund owner, Manchester",
    initial: "P",
  },
];

function Testimonials() {
  return (
    <section className="py-24" style={{ background: "linear-gradient(135deg, #FAEFD1 0%, #f5e8c8 100%)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-bold text-[#B74217] uppercase tracking-widest mb-3">Loved by dog owners</p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a]">
            What dog owners say
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.author}
              className="bg-white rounded-2xl p-7 flex flex-col gap-5 shadow-sm shadow-stone-200 border border-stone-50"
            >
              {/* Paw rating — matches in-app icon exactly */}
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="20" height="20" viewBox="0 0 40 40" fill="#B74217">
                    <path d="M7.29239 19.4593C8.11648 20.724 9.40644 21.4576 10.6485 21.4978C11.2588 21.5175 11.8582 21.3693 12.3828 21.0295C13.167 20.5196 13.6537 19.6758 13.7571 18.652C13.8591 17.6714 13.5952 16.6357 13.0081 15.7355C12.4209 14.8353 11.5826 14.1757 10.6464 13.8698C9.66742 13.5516 8.69637 13.6553 7.91763 14.1654C6.33819 15.1955 6.05616 17.5651 7.29239 19.4593Z"/>
                    <path d="M16.4619 15.7553C17.3854 15.6176 18.1874 15.0543 18.708 14.1683C19.2112 13.3196 19.4019 12.2715 19.2471 11.2069C18.9192 8.97445 17.1434 7.38172 15.2804 7.65127C14.3569 7.789 13.5602 8.35251 13.0344 9.23292C12.5313 10.0816 12.3404 11.1351 12.4954 12.1942C12.6502 13.2588 13.133 14.2097 13.8573 14.8818C14.4716 15.4477 15.2022 15.7579 15.9474 15.7819C16.1202 15.7875 16.2936 15.7769 16.4619 15.7553Z"/>
                    <path d="M27.8596 12.6908C28.0826 11.6438 27.9602 10.5803 27.5129 9.70083C27.045 8.78829 26.2864 8.17451 25.3738 7.97742C24.4609 7.78573 23.5176 8.03635 22.7183 8.68086C21.952 9.30482 21.4088 10.2225 21.1857 11.2695C20.7144 13.4761 21.8298 15.5935 23.666 15.9881C23.8379 16.0207 24.0048 16.0423 24.1722 16.0477C25.8409 16.1016 27.4324 14.6988 27.8596 12.6908Z"/>
                    <path d="M25.1617 21.7288C24.7014 21.5842 24.3454 21.2267 24.1824 20.7511C23.5508 18.8818 21.9151 17.6396 20.0141 17.5781C18.1078 17.5165 16.3951 18.6559 15.6443 20.4751C15.4507 20.9446 15.0725 21.2729 14.6092 21.3877C12.4408 21.9069 10.8223 23.8115 10.7544 25.9123C10.6687 28.5639 12.6726 30.7911 15.227 30.8737C16.1235 30.9027 17.0285 30.667 17.8439 30.196C18.9679 29.5404 20.2856 29.583 21.3649 30.3099C22.1427 30.8324 23.0307 31.126 23.9271 31.1549C26.4815 31.2375 28.6251 29.1444 28.7109 26.4928C28.7789 24.3866 27.2866 22.3868 25.1617 21.7288Z"/>
                    <path d="M33.5237 17.4148C33.4813 16.3863 33.05 15.5127 32.3004 14.9533C31.5562 14.3941 30.5939 14.2278 29.5964 14.4821C28.6424 14.7269 27.7579 15.3309 27.1192 16.1914C25.7686 18.002 25.897 20.3849 27.4012 21.5147C27.8921 21.882 28.4804 22.0794 29.1069 22.0996C29.4309 22.1101 29.7673 22.0723 30.1053 21.9859C31.0646 21.7412 31.9437 21.1372 32.5824 20.2766C33.2265 19.4162 33.5621 18.3999 33.5237 17.4148Z"/>
                  </svg>
                ))}
              </div>

              <p className="text-[#1a1a1a] text-sm leading-relaxed flex-1">"{t.quote}"</p>

              <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                <div className="w-9 h-9 rounded-full bg-[#B74217] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {t.initial}
                </div>
                <div>
                  <p className="font-bold text-sm text-[#1a1a1a]">{t.author}</p>
                  <p className="text-xs text-[#585858]">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  { q: "How do I get started?", a: "Download BarkFind from the App Store and start your 14-day free trial — full access to every feature, no credit card required." },
  { q: "How does the free trial work?", a: "You get 14 days of full, unrestricted access to every BarkFind feature — no credit card required. After your trial, choose a monthly (£4/month) or annual (£40/year) subscription to keep going." },
  { q: "What happens after my trial ends?", a: "You'll be prompted to subscribe to either the monthly or annual plan. If you choose not to subscribe, your access to the app will pause until you do." },
  { q: "Is BarkFind available on Android?", a: "BarkFind is on iOS first. Android is on the roadmap and coming soon — follow us to be the first to know when it lands." },
  { q: "How are locations verified?", a: "Locations are verified through a combination of community reports, business owner claims, and our moderation team. A verified badge means the dog-friendly status has been confirmed." },
  { q: "What is a Dog Profile?", a: "A Dog Profile lets you add details about your dog — breed, size, temperament — so BarkFind can personalise recommendations based on what suits your dog specifically." },
  { q: "How do the review rewards work?", a: "Submit 10 reviews to earn 25% off your next bill, 20 reviews for 50% off, or 50 reviews for a full year free. Once you hit a milestone, tap Redeem in the app to receive your unique promo code. Discounts apply to your next billing cycle (monthly or annual)." },
  { q: "Can I list my business on BarkFind?", a: "Yes! Business owners can claim their listing for free. Premium business features (sponsored placement, analytics) are coming soon." },
  { q: "Is my data safe?", a: "Absolutely. We never sell your data. All personal information is stored securely and you can delete your account at any time." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-bold text-[#B74217] uppercase tracking-widest mb-3">FAQ</p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#1a1a1a]">
            Common questions
          </h2>
        </div>

        <div className="flex flex-col gap-2">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`rounded-xl border transition-all ${open === i ? "border-[#B74217]/20 bg-[#FAEFD1]/40" : "border-stone-100 bg-white hover:border-stone-200"}`}
            >
              <button
                className="w-full flex items-center justify-between text-left gap-4 px-5 py-4"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-semibold text-[#1a1a1a] text-sm md:text-base">{item.q}</span>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${open === i ? "bg-[#B74217] text-white" : "bg-stone-100 text-[#585858]"}`}>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {open === i && (
                <p className="px-5 pb-4 text-sm text-[#585858] leading-relaxed">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Download CTA ─────────────────────────────────────────────────────────────

function AppStoreButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      className={`inline-flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-[#1a1a1a] text-white hover:opacity-90 transition-opacity shadow-lg ${className}`}
    >
      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.564 12.78c-.02-2.14 1.75-3.17 1.83-3.22-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.13-1.5 2.6-.38 6.44 1.07 8.55.71 1.03 1.55 2.19 2.66 2.15 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.88-1.05 2.58-2.09.81-1.2 1.15-2.36 1.17-2.42-.03-.01-2.24-.86-2.26-3.4zM15.43 6.27c.59-.72.99-1.71.88-2.71-.85.04-1.88.57-2.49 1.28-.55.63-1.03 1.64-.9 2.61.95.07 1.92-.48 2.51-1.18z" />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[10px] font-medium opacity-80">Download on the</span>
        <span className="block text-lg font-bold -mt-0.5">App Store</span>
      </span>
    </a>
  );
}

function AndroidNotify() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source: "android-waitlist" }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="mt-10 pt-8 border-t border-white/15 w-full max-w-md mx-auto">
      <div className="flex items-center justify-center gap-2 mb-3 text-white/90">
        {/* Android robot */}
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 18a1 1 0 001 1h1v3.5a1.5 1.5 0 003 0V19h2v3.5a1.5 1.5 0 003 0V19h1a1 1 0 001-1V8H6v10zM3.5 8A1.5 1.5 0 002 9.5v6a1.5 1.5 0 003 0v-6A1.5 1.5 0 003.5 8zm17 0A1.5 1.5 0 0019 9.5v6a1.5 1.5 0 003 0v-6A1.5 1.5 0 0020.5 8zM15.5 3.2l1.3-1.3a.4.4 0 10-.56-.56l-1.48 1.48A5.96 5.96 0 0012 2c-.99 0-1.92.24-2.75.66L7.77 1.34a.4.4 0 10-.56.56l1.3 1.3A5.98 5.98 0 006 7h12a5.98 5.98 0 00-2.5-3.8zM9.5 5.5a.75.75 0 110-1.5.75.75 0 010 1.5zm5 0a.75.75 0 110-1.5.75.75 0 010 1.5z" />
        </svg>
        <p className="font-bold text-sm">On Android?</p>
      </div>

      {status === "success" ? (
        <p className="text-white/85 text-sm">You're on the list — we'll email you the moment BarkFind lands on Android. 🐾</p>
      ) : (
        <>
          <p className="text-white/60 text-sm mb-4">Get notified the moment we launch on Android.</p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="flex-1 px-5 py-3 rounded-full text-[#1a1a1a] text-sm font-medium outline-none focus:ring-2 focus:ring-white/40 bg-white"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="px-6 py-3 rounded-full bg-[#1a1a1a] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap"
            >
              {status === "loading" ? "…" : "Notify me"}
            </button>
          </form>
          {status === "error" && <p className="mt-3 text-white/60 text-xs">Something went wrong. Please try again.</p>}
        </>
      )}
    </div>
  );
}

function DownloadCTA() {
  return (
    <section
      id="download"
      className="relative py-28 overflow-hidden"
      style={{ background: "linear-gradient(135deg, #B74217 0%, #9a3512 100%)" }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }} />
      <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #FAEFD1 0%, transparent 70%)" }} />

      <div className="relative max-w-2xl mx-auto px-6 text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-white/15 items-center justify-center mx-auto mb-6">
          <img src="/barkfind-paw-logo.png" alt="" className="w-8 h-8 brightness-0 invert" />
        </div>
        <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white mb-5">
          Be the first to explore<br />every adventure with your dog
        </h2>
        <p className="text-white/75 text-lg mb-9 leading-relaxed">
          Download BarkFind and start your 14-day free trial — full access to the map, Mylo AI, reviews, and rewards. No credit card required.
        </p>

        <div className="flex flex-col items-center gap-4">
          <AppStoreButton />
          <p className="text-white/50 text-xs">14-day free trial · Cancel any time</p>
        </div>

        <AndroidNotify />
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-white/50 py-14">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center">
          <img src="/barkfind-logo-white.png" alt="BarkFind" className="h-7 opacity-80" />
        </div>

        <nav className="flex flex-wrap justify-center gap-7 text-sm">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          <a href="mailto:info@barkfind.com" className="hover:text-white transition-colors">Contact</a>
        </nav>

        <a
          href="https://www.instagram.com/barkfindapp"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
          aria-label="Instagram"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
        </a>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-center text-xs">
        © {new Date().getFullYear()} BarkFind. All rights reserved.
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen font-sans">
      <Nav />
      <Hero />
      <TrustBar />
      <AppShowcase />
      <Mylo />
      <Features />
      <Rewards />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <FAQ />
      <DownloadCTA />
      <Footer />
    </div>
  );
}
