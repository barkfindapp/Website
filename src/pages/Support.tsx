import PageShell, { Section, Bullets } from "../components/PageShell";

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-white p-5">
      <p className="font-bold text-[#1a1a1a] mb-2">{q}</p>
      <div className="text-sm text-[#585858] leading-relaxed flex flex-col gap-2">{children}</div>
    </div>
  );
}

export default function Support() {
  return (
    <PageShell
      title="Help & Support"
      subtitle="Answers to common questions, and how to reach us if you need a hand."
    >
      {/* Contact banner */}
      <div className="rounded-2xl bg-[#FAEFD1] border border-[#B74217]/15 p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
        <div className="w-12 h-12 rounded-full bg-[#B74217] flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-[#1a1a1a] text-base">Need help? We're happy to assist.</p>
          <p className="text-sm text-[#585858] mt-0.5">
            Email us at{" "}
            <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>{" "}
            and we'll get back to you as soon as we can.
          </p>
        </div>
      </div>

      <Section title="Getting started">
        <QA q="How do I start using BarkFind?">
          <p>Download BarkFind from the App Store, create an account with your email (or sign in with Apple or Google), and add your dog's profile. Your 14-day free trial unlocks every feature — no card required.</p>
        </QA>
        <QA q="Which devices are supported?">
          <p>BarkFind is available on iPhone (iOS). Android is on the way — you can register interest on our homepage to be notified when it launches.</p>
        </QA>
      </Section>

      <Section title="Subscriptions & billing">
        <QA q="How does the free trial work?">
          <p>New subscribers get 14 days of full access, free, with no card required. If you don't cancel before the trial ends, it converts to your chosen plan (Monthly £4.99 or Annual £39.99).</p>
        </QA>
        <QA q="How do I cancel or manage my subscription?">
          <p>Subscriptions are billed through your Apple App Store account. Manage or cancel any time via <strong>iPhone Settings → your name → Subscriptions → BarkFind</strong>. Deleting the app does not cancel your subscription.</p>
        </QA>
        <QA q="Can I get a refund?">
          <p>Refunds are handled by Apple under App Store policy. You can request one at <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className="text-[#B74217] font-semibold hover:underline">reportaproblem.apple.com</a>.</p>
        </QA>
      </Section>

      <Section title="Location & permissions">
        <QA q="Why does BarkFind ask for my location?">
          <p>Location lets us show dog-friendly places near you and power distance-based search. You can use the app without it, but nearby features will be limited.</p>
        </QA>
        <QA q="How do I change location permissions?">
          <p>Go to <strong>iPhone Settings → BarkFind → Location</strong> and choose your preference at any time.</p>
        </QA>
      </Section>

      <Section title="Reviews & rewards">
        <QA q="How do the review rewards (Treats) work?">
          <p>Submit approved reviews to unlock discounts: 10 reviews = 25% off, 20 = 50% off, 50 = a year free. Tap Redeem in the app when you hit a milestone to get your promo code. Discounts apply to your next billing cycle.</p>
        </QA>
        <QA q="How do I report an inappropriate review or listing?">
          <p>Use the report option within the app on any review or place. We review reports and remove content that breaks our rules. See our <a href="/terms" className="text-[#B74217] font-semibold hover:underline">Terms of Use</a> for details.</p>
        </QA>
      </Section>

      <Section title="Mylo AI">
        <QA q="What is Mylo?">
          <p>Mylo is BarkFind's AI assistant. Ask it in plain English — "a quiet pub with a water bowl" — and it finds matching places from BarkFind's rated directory. Monthly plans include 10 searches per day; Annual plans are unlimited.</p>
        </QA>
      </Section>

      <Section title="Account & data">
        <p>You can export or delete your data at any time. See our dedicated{" "}
          <a href="/delete-account" className="text-[#B74217] font-semibold hover:underline">Account & Data Deletion</a> page, or read how we handle your information in our{" "}
          <a href="/privacy" className="text-[#B74217] font-semibold hover:underline">Privacy Policy</a>.
        </p>
      </Section>

      <Section title="Still need help?">
        <Bullets
          items={[
            <>Email <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a> — include your account email and a description of the issue.</>,
            <>Business owner? Visit our <a href="/business" className="text-[#B74217] font-semibold hover:underline">For Businesses</a> page.</>,
          ]}
        />
      </Section>
    </PageShell>
  );
}
