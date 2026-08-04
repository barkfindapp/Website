import PageShell, { Section } from "../components/PageShell";

// Brand paw mark (matches the in-app rating / rewards icon)
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

const TIERS = [
  { reviews: 10, reward: "25% off", detail: "your next BarkFind bill" },
  { reviews: 20, reward: "50% off", detail: "your next BarkFind bill" },
  { reviews: 50, reward: "1 year free", detail: "on us — our biggest treat", highlight: true },
];

const STEPS = [
  { n: 1, title: "Visit & review", body: "Head out with your dog, then leave an honest review of any dog-friendly place in the app — a paw rating, a few words, and a photo if you have one." },
  { n: 2, title: "Hit a milestone", body: "Your review count climbs as you go. Treats unlock at 10, 20 and 50 reviews." },
  { n: 3, title: "Claim your treat", body: "When you hit a milestone, a Treat unlocks in the app. Tap to claim it and get your reward." },
];

const REDEEM_STEPS = [
  { n: 1, title: "Open BarkFind", body: "Go to the Profile tab, then open Treats." },
  { n: 2, title: "Find your unlocked milestone", body: "Any milestone you've reached (10, 20 or 50 reviews) will be ready to claim." },
  { n: 3, title: "Tap Redeem", body: "You'll get a unique promo code for your reward." },
  { n: 4, title: "Enjoy the discount", body: "Your discount applies to your next billing cycle — monthly or annual. No vouchers to chase, no fuss." },
];

const FAQ = [
  { q: "Do my reviews need photos?", a: "Photos aren't required to earn Treats, but they're hugely helpful to other dog owners — a quick snap of the space, the water bowl, or the garden makes your review much more useful." },
  { q: "What counts as a review?", a: "A genuine review of a dog-friendly place you've visited — a paw rating plus your honest thoughts. Reviews should reflect a real visit." },
  { q: "Do Treats expire?", a: "Once unlocked, a Treat stays in your Treats screen ready to claim. Redeem it whenever suits you — the discount then applies to your next billing cycle. (Reward validity terms to be confirmed.)" },
  { q: "Can I earn a Treat more than once?", a: "Each milestone — 10, 20 and 50 reviews — can be claimed once." },
  { q: "My claim didn't come through — what do I do?", a: "Get in touch at info@barkfind.com with your account email and the milestone you claimed, and we'll sort it out." },
  { q: "Do fake or low-quality reviews count?", a: "No. Treats reward genuine contributions. Reviews found to be fake, spammy or manipulated may have their rewards withheld or revoked — see our Terms of Use." },
];

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-[#B74217] text-white font-bold text-sm flex items-center justify-center flex-shrink-0">{n}</div>
      <div>
        <p className="font-bold text-[#1a1a1a]">{title}</p>
        <p className="text-sm text-[#585858] leading-relaxed mt-1">{body}</p>
      </div>
    </div>
  );
}

export default function Treats() {
  return (
    <PageShell
      title="How Treats work"
      subtitle="Write reviews, earn Treats. Here's everything you need to know about BarkFind's rewards programme — from your first review to redeeming your reward."
    >
      <p className="text-[#444] leading-relaxed">
        Treats are our way of saying thank you. Every review you leave helps other dog owners find great
        dog-friendly places — and the more you contribute, the more you save on BarkFind.
      </p>

      {/* Milestone tiers */}
      <Section title="The Treats">
        <p>Treats unlock at three review milestones:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          {TIERS.map((t) => (
            <div
              key={t.reviews}
              className={`rounded-2xl p-6 flex flex-col items-center text-center gap-2 border ${
                t.highlight ? "bg-[#B74217] border-[#B74217] text-white" : "bg-white border-stone-100 shadow-sm shadow-stone-100"
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${t.highlight ? "bg-white/15" : "bg-[#FAEFD1]"}`}>
                <PawMark className="w-6 h-6" color={t.highlight ? "#ffffff" : "#B74217"} />
              </div>
              <p className={`text-xs font-bold uppercase tracking-widest ${t.highlight ? "text-white/70" : "text-[#585858]"}`}>
                {t.reviews} reviews
              </p>
              <p className={`font-serif text-2xl ${t.highlight ? "text-white" : "text-[#1a1a1a]"}`}>{t.reward}</p>
              <p className={`text-sm ${t.highlight ? "text-white/80" : "text-[#585858]"}`}>{t.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section title="How it works">
        <div className="flex flex-col gap-5 mt-1">
          {STEPS.map((s) => (
            <Step key={s.n} {...s} />
          ))}
        </div>
      </Section>

      {/* How to redeem — the previously-missing bit */}
      <Section title="How to redeem your Treat">
        <p>
          Here's exactly what happens when you claim — you'll find it all under{" "}
          <strong className="text-[#1a1a1a]">Profile → Treats</strong> in the app:
        </p>
        <div className="flex flex-col gap-5 mt-1">
          {REDEEM_STEPS.map((s) => (
            <Step key={s.n} {...s} />
          ))}
        </div>
        <div className="rounded-xl bg-[#FAEFD1] border border-[#B74217]/15 p-4 mt-2 text-sm text-[#585858]">
          Your promo code is unique to you and applies the discount to your next BarkFind subscription payment. If
          anything doesn't come through, email{" "}
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
        </div>
      </Section>

      {/* FAQ */}
      <Section title="Questions">
        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-xl border border-stone-100 bg-white p-5">
              <p className="font-bold text-[#1a1a1a] mb-1.5">{item.q}</p>
              <p className="text-sm text-[#585858] leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section title="Start earning Treats">
        <p>Got BarkFind? Head to Profile → Treats to see your progress. New here?</p>
        <a
          href="/#download"
          className="inline-flex items-center justify-center mt-1 px-7 py-3.5 rounded-full bg-[#B74217] text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-sm shadow-[#B74217]/25 self-start"
        >
          Get BarkFind — start your 14-day free trial
        </a>
      </Section>
    </PageShell>
  );
}
