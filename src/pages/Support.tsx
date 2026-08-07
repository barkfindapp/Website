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
          <p>BarkFind is launching on iPhone soon and isn't downloadable yet. Join early access on our homepage to be first in — we'll email you the moment it's live. At launch you'll create an account, add your dog's profile, and start your 14-day free trial.</p>
        </QA>
        <QA q="Which devices are supported?">
          <p>BarkFind is coming to iPhone (iOS) first. Android is on the way — register interest on our homepage to be notified when either launches.</p>
        </QA>
      </Section>

      <Section title="Subscriptions & billing">
        <QA q="How does the free trial work?">
          <p>At launch, new subscribers start a 14-day free trial. It's card-gated through Apple — you add a payment method to begin but you're charged £0 up front. If you don't cancel before it ends, it auto-renews into your chosen plan (Monthly £5.99 or Annual £39.99).</p>
        </QA>
        <QA q="What happens when my trial ends?">
          <p>If you don't subscribe, BarkFind switches to read-only rather than locking you out. You keep your saved spots, your profile and dog profile, and your own reviews — and you can still read other people's reviews and leave new ones. You lose searching for new places, Ask Mylo, saving new favourites, and dog-profile recommendations until you subscribe.</p>
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
          <p>Reviews earn points — one per review, or two with a photo and a description. On a monthly plan, 10 points = 25% off and 20 = 50% off your monthly bill (rolling 90 days); annual members get one reward claim per account; 50 points = a free year on either plan. Tap Redeem in the app to get your promo code. <a href="/treats" className="text-[#B74217] font-semibold hover:underline">More on how Treats work</a>.</p>
        </QA>
        <QA q="How do I report an inappropriate review or listing?">
          <p>Use the report option within the app on any review or place. We review reports and remove content that breaks our rules. See our <a href="/terms" className="text-[#B74217] font-semibold hover:underline">Terms of Use</a> for details.</p>
        </QA>
      </Section>

      <Section title="Mylo AI">
        <QA q="What is Mylo?">
          <p>Mylo is BarkFind's AI assistant, included with your subscription. Ask it in plain English — "a quiet pub with a water bowl" — and it finds matching places from BarkFind's rated directory.</p>
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
