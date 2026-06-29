// BarkFind Privacy Policy — rendered at /privacy
// Source: company-supplied draft (last updated 29 June 2026).
// TODO: add ICO registration number to the Contact section once confirmed.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-4">{title}</h2>
      <div className="flex flex-col gap-4 text-[#444] leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen font-sans bg-white text-[#212121]">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-[#FAEFD1]/80 backdrop-blur-md border-b border-[#B74217]/10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
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
        <div className="max-w-3xl mx-auto px-6 py-14">
          <h1 className="font-serif text-4xl md:text-5xl text-[#1a1a1a] mb-3">Privacy Policy</h1>
          <p className="text-sm text-[#585858] font-semibold">Last updated: 29 June 2026</p>
        </div>
      </div>

      {/* Body */}
      <main className="max-w-3xl mx-auto px-6 py-14">
        <p className="text-[#444] leading-relaxed">
          BarkFind ("BarkFind", "we", "us", "our") is operated by <strong>BARKFIND LIMITED</strong> (company
          no. GB17093288), registered at 80A Walliscote Road, Weston-Super-Mare, North Somerset, United
          Kingdom, BS23 1ED. We are the controller of your personal data under UK data protection law
          (UK GDPR and the Data Protection Act 2018).
        </p>
        <p className="text-[#444] leading-relaxed mt-4">
          This policy explains what data we collect through the BarkFind mobile app, why we collect it, who we
          share it with, and the rights you have. If you have any questions, contact us at{" "}
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
        </p>

        <Section title="Who this applies to">
          <p>
            BarkFind is intended for dog owners aged 18 and over in the United Kingdom. The app is not directed
            at children, and we do not knowingly collect data from anyone under 16.
          </p>
        </Section>

        <Section title="What we collect">
          <p>We only collect what we need to run BarkFind. Specifically:</p>
          <ul className="flex flex-col gap-3 list-none">
            {[
              ["Account information", "your name and email address when you create an account or contact support. Authentication is handled through our backend provider; if you sign in with Apple or Google, we receive the basic identifiers you authorise."],
              ["Location", "with your permission, your device's precise location, used to show dog-friendly places near you and to power distance-based search. You can turn location access off at any time in your device settings; some features will be limited without it."],
              ["Content you create", "reviews, ratings, photos you upload, your dog's profile (name, breed, size, temperament and similar details), saved favourites, and messages you send us through support."],
              ["Search activity", "the searches you run in the app, including questions you ask our AI assistant “Mylo”, so we can return results and improve the feature."],
              ["Usage data", "how you interact with the app (for example sessions, screens viewed and search counts) and basic device information, used for analytics and to keep the app working reliably."],
              ["Purchase information", "your subscription status and history. Payment itself is processed by Apple; we never see or store your card details."],
            ].map(([term, def]) => (
              <li key={term} className="pl-4 border-l-2 border-[#FAEFD1]">
                <strong className="text-[#1a1a1a]">{term}</strong> — {def}
              </li>
            ))}
          </ul>
          <p>
            We do <strong>not</strong> collect special category (sensitive) data, and we do <strong>not</strong> use
            any third-party advertising or cross-app tracking. BarkFind does not track you across other companies'
            apps or websites.
          </p>
        </Section>

        <Section title="How we use your data">
          <p>
            We use your data to: create and manage your account; show you nearby dog-friendly places and
            personalised recommendations; operate the Mylo AI assistant; publish and moderate community reviews;
            manage subscriptions and the free trial; provide customer support; keep the app secure and prevent
            abuse; and understand and improve how BarkFind is used.
          </p>
        </Section>

        <Section title="Legal bases (UK GDPR)">
          <p>
            We rely on: <strong>performance of a contract</strong> (to provide the app and your subscription);
            <strong> consent</strong> (for precise location access, which you can withdraw at any time); and our
            <strong> legitimate interests</strong> (to secure, maintain, analyse and improve the service, and to
            moderate community content), balanced against your rights.
          </p>
        </Section>

        <Section title="Who we share it with">
          <p>
            We use trusted service providers ("processors") who handle data on our behalf under contract, only as
            needed to run BarkFind:
          </p>
          <ul className="flex flex-col gap-3 list-none">
            {[
              ["Supabase", "backend database, authentication and file storage."],
              ["RevenueCat and Apple", "subscription management and payment processing."],
              ["Anthropic", "powers the Mylo AI assistant; your search query (and limited dog-profile context) is processed to generate results. It is not used to train third-party models for advertising."],
              ["Google Maps Platform", "map display and place data."],
            ].map(([term, def]) => (
              <li key={term} className="pl-4 border-l-2 border-[#FAEFD1]">
                <strong className="text-[#1a1a1a]">{term}</strong> — {def}
              </li>
            ))}
          </ul>
          <p>
            Some of these providers process data outside the UK (including in the United States). Where they do, we
            rely on appropriate safeguards such as the UK International Data Transfer Agreement / Addendum or
            equivalent mechanisms.
          </p>
          <p>
            We do not sell your personal data. We may disclose data if required by law, or to protect our rights,
            users, or the public.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your account data for as long as your account is active. If you delete your account, we delete
            or anonymise your personal data within a reasonable period, except where we must retain limited records
            to meet legal, tax or fraud-prevention obligations. Community reviews may be retained in anonymised
            form.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under UK GDPR you have the right to access, correct, delete, restrict or object to our processing of
            your data, to data portability, and to withdraw consent. The app provides in-built tools to{" "}
            <strong>export</strong> and <strong>delete</strong> your data, and you can also contact us at{" "}
            <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
            You have the right to complain to the Information Commissioner's Office (ICO) at{" "}
            <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-[#B74217] font-semibold hover:underline">ico.org.uk</a>.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We protect your data with industry-standard measures including encryption in transit, access controls
            and row-level security on our database. No system is perfectly secure, but we work to keep your
            information safe.
          </p>
        </Section>

        <Section title="Children">
          <p>
            BarkFind is not intended for children under 16. If you believe a child has provided us with personal
            data, contact us and we will delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. We will post the new version here and update the "Last
            updated" date; significant changes will be communicated in the app.
          </p>
        </Section>

        <Section title="Contact">
          <div className="rounded-2xl bg-[#FAEFD1] p-6 not-prose">
            <p className="font-bold text-[#1a1a1a] mb-1">BARKFIND LIMITED</p>
            <p className="text-sm text-[#585858]">80A Walliscote Road, Weston-Super-Mare, North Somerset, United Kingdom, BS23 1ED</p>
            <p className="text-sm text-[#585858] mt-2">
              Email:{" "}
              <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>
            </p>
          </div>
        </Section>
      </main>

      {/* Footer */}
      <footer className="bg-[#1a1a1a] text-white/50 py-10">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <img src="/barkfind-logo-white.png" alt="BarkFind" className="h-7 opacity-80" />
          <div className="flex gap-6">
            <a href="/" className="hover:text-white transition-colors">Home</a>
            <a href="mailto:info@barkfind.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          <span className="text-xs">© {new Date().getFullYear()} BarkFind. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
