// BarkFind Terms of Use — rendered at /terms
// Source: company-supplied draft.
// Defaults applied: Last updated = 29 June 2026; contact = info@barkfind.com.
// TODO: confirm date + contact email before relying on this publicly.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-4">{title}</h2>
      <div className="flex flex-col gap-4 text-[#444] leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
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

export default function TermsOfUse() {
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
          <h1 className="font-serif text-4xl md:text-5xl text-[#1a1a1a] mb-3">Terms of Use</h1>
          <p className="text-sm text-[#585858] font-semibold">Last updated: 29 June 2026</p>
        </div>
      </div>

      {/* Body */}
      <main className="max-w-3xl mx-auto px-6 py-14">
        <p className="text-[#444] leading-relaxed">
          These Terms of Use ("Terms") govern your access to and use of the BarkFind mobile app and the
          barkfind.com website (together, the "Service"), operated by BarkFind Limited (company no. GB17093288),
          registered at 80A Walliscote Road, Weston-Super-Mare BS23 1ED, United Kingdom ("BarkFind", "we", "us",
          "our").
        </p>
        <p className="text-[#444] leading-relaxed mt-4">
          By downloading, accessing or using the Service, you agree to these Terms. If you do not agree, do not
          use the Service.
        </p>

        <Section title="1. Who can use BarkFind">
          <p>
            You must be at least 18 years old and able to form a binding contract to use the Service. BarkFind is
            currently intended for users in the United Kingdom.
          </p>
        </Section>

        <Section title="2. Your account">
          <p>
            To use most features you must create an account. You agree to provide accurate information, keep your
            password secure, and accept responsibility for all activity under your account. You may sign in using
            email and password or a third-party provider (such as Apple or Google). You can delete your account at
            any time in Settings.
          </p>
        </Section>

        <Section title="3. Subscriptions, free trial and billing">
          <p>
            BarkFind offers auto-renewable subscriptions ("BarkFind Premium") on a monthly or annual basis,
            including a 14-day free trial for new subscribers.
          </p>
          <Bullets
            items={[
              <><strong>Payment</strong> is charged to your Apple App Store account at confirmation of purchase.</>,
              <><strong>Auto-renewal:</strong> Your subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the end of the current period.</>,
              <><strong>Free trial:</strong> If you do not cancel before the trial ends, it converts to a paid subscription. Any unused portion of a free trial is forfeited if you purchase a subscription.</>,
              <><strong>Managing and cancelling:</strong> You can manage or cancel your subscription, and turn off auto-renewal, in your App Store account settings. Deleting the app does not cancel your subscription.</>,
              <><strong>Price changes:</strong> We may change subscription prices; changes apply to future billing periods and we will give notice as required by the App Store.</>,
              <><strong>Refunds</strong> are handled by Apple in accordance with App Store policies; we generally cannot issue refunds directly.</>,
            ]}
          />
        </Section>

        <Section title='4. Rewards ("Treats")'>
          <p>
            You may earn rewards, such as billing discounts, for submitting approved reviews. Rewards are offered
            at our discretion, may change or be withdrawn, have no cash value, and may not be sold or transferred.
            We may withhold or revoke rewards obtained through fake, low-quality, or fraudulent reviews.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>You agree not to:</p>
          <Bullets
            items={[
              "break any law, or infringe anyone's rights;",
              "post content that is false, misleading, defamatory, abusive, hateful, harassing, obscene, or otherwise objectionable;",
              "submit fake, incentivised (other than our Treats programme) or manipulated reviews;",
              "harass, threaten, impersonate or harm other users;",
              "scrape, copy, or misuse our data, or attempt to disrupt or reverse-engineer the Service;",
              "use the Service for any commercial purpose except as expressly permitted (e.g. claiming a business listing).",
            ]}
          />
        </Section>

        <Section title="6. User content, reviews and moderation">
          <p>
            You are responsible for the reviews, photos, ratings, profiles and other content you submit ("User
            Content"). By submitting User Content, you grant BarkFind a worldwide, non-exclusive, royalty-free
            licence to host, store, display, reproduce and distribute it for the purpose of operating and promoting
            the Service. You confirm you have the rights to the content you submit.
          </p>
          <p>
            <strong>Zero tolerance:</strong> We do not tolerate objectionable content or abusive behaviour. User
            Content may be screened automatically and/or manually before or after publication. You can{" "}
            <strong>report</strong> inappropriate content or listings from within the app, and we aim to review
            reports and remove violating content and remove or ban offending users promptly. We may also let you{" "}
            <strong>block</strong> other users. We may remove any content and suspend or terminate any account at
            our discretion.
          </p>
        </Section>

        <Section title="7. Place listings and ratings">
          <p>
            BarkFind shows dog-friendly places with information, amenities and ratings sourced from our community,
            public sources and third parties. This information may be incomplete, out of date or inaccurate.
            Whether dogs are welcome is ultimately at each venue's discretion — always check with the venue before
            relying on a listing. BarkFind is not responsible for your experience at any venue.
          </p>
        </Section>

        <Section title="8. Mylo AI assistant">
          <p>
            "Mylo" provides AI-generated suggestions based on your request and available data. Suggestions may be
            inaccurate or incomplete and are provided for convenience only — they are not professional advice. Use
            your own judgement.
          </p>
        </Section>

        <Section title="9. Intellectual property">
          <p>
            The Service, including its software, design, branding and content (excluding User Content), is owned by
            BarkFind or its licensors and protected by law. We grant you a limited, personal, non-transferable,
            revocable licence to use the Service for its intended purpose. You may not copy, modify, distribute or
            create derivative works except as permitted by these Terms.
          </p>
        </Section>

        <Section title="10. Third-party services">
          <p>
            The Service relies on third parties (including Apple, Google Maps and others). Your use of those
            services may be subject to their own terms. We are not responsible for third-party services or content.
          </p>
        </Section>

        <Section title="11. Disclaimers">
          <p>
            The Service is provided "as is" and "as available", without warranties of any kind, to the fullest
            extent permitted by law. We do not warrant that the Service will be uninterrupted, error-free, or that
            listings or AI suggestions are accurate. Nothing in these Terms excludes liability that cannot be
            excluded under law (including your statutory rights as a consumer in the UK).
          </p>
        </Section>

        <Section title="12. Limitation of liability">
          <p>
            To the fullest extent permitted by law, BarkFind will not be liable for any indirect, incidental,
            special or consequential losses, or for loss of profits, data or goodwill. Our total liability arising
            out of or relating to the Service is limited to the greater of the amount you paid us in the 12 months
            before the claim, or £50. Nothing limits liability for death or personal injury caused by negligence,
            fraud, or any liability that cannot be limited by law.
          </p>
        </Section>

        <Section title="13. Termination">
          <p>
            We may suspend or terminate your access at any time for breach of these Terms. You may stop using the
            Service and delete your account at any time. Sections that by their nature should survive termination
            (including content licence, disclaimers, and limitation of liability) will survive.
          </p>
        </Section>

        <Section title="14. Changes to these Terms">
          <p>
            We may update these Terms from time to time. We will post the updated version with a new "Last updated"
            date, and significant changes will be communicated in the app or on the website. Continued use after
            changes means you accept the updated Terms.
          </p>
        </Section>

        <Section title="15. Governing law">
          <p>
            These Terms are governed by the laws of England and Wales, and the courts of England and Wales have
            exclusive jurisdiction, subject to any mandatory consumer protections in your country of residence.
          </p>
        </Section>

        <Section title="16. Apple App Store — additional terms">
          <p>
            These additional terms apply to your use of the BarkFind iOS app downloaded from the Apple App Store:
          </p>
          <Bullets
            items={[
              "These Terms are between you and BarkFind only, not Apple. BarkFind, not Apple, is solely responsible for the app and its content.",
              "Apple has no obligation to provide maintenance or support for the app.",
              "To the extent permitted by law, Apple has no warranty obligation for the app; any warranty claims are BarkFind's responsibility.",
              "Apple is not responsible for addressing any claims relating to the app, including product liability, legal/regulatory compliance, or consumer protection claims.",
              "Apple is not responsible for investigating, defending or resolving any third-party intellectual-property claim relating to the app.",
              "You confirm you are not located in a country subject to a U.S. Government embargo or designated as “terrorist supporting”, and are not on any U.S. Government list of prohibited or restricted parties.",
              "Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.",
            ]}
          />
        </Section>

        <Section title="17. Contact">
          <div className="rounded-2xl bg-[#FAEFD1] p-6">
            <p className="font-bold text-[#1a1a1a] mb-1">BarkFind Limited</p>
            <p className="text-sm text-[#585858]">80A Walliscote Road, Weston-Super-Mare BS23 1ED, United Kingdom</p>
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
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="mailto:info@barkfind.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          <span className="text-xs">© {new Date().getFullYear()} BarkFind. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
