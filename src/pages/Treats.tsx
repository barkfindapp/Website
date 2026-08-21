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

const EARN = [
  { pts: "1 point", body: "An approved review: your paw rating and a quick verdict on the place." },
  { pts: "2 points", body: "Write a bit about your visit (40 characters or more) and the same review is worth two points. Photos are welcome, but they don't change the points.", highlight: true },
];

// Rewards differ by plan, because a percentage off a single yearly bill wouldn't
// add up to much. Points and windows are the same; what they unlock differs.
const MONTHLY_TIERS = [
  { points: 10, reward: "25% off your next month", detail: "£4.49 instead of £5.99" },
  { points: 20, reward: "50% off your next month", detail: "£2.99 instead of £5.99" },
];
const ANNUAL_TIERS = [
  { points: 10, reward: "30 days added", detail: "on to your subscription" },
  { points: 20, reward: "90 days added", detail: "on to your subscription" },
];

const REDEEM_STEPS = [
  { n: 1, title: "Claim in the app", body: "Open the Profile tab, then Treats, and claim the reward you've reached." },
  { n: 2, title: "Monthly discounts", body: "Apple applies the discount to your next payment. There's no code to enter and no voucher to keep." },
  { n: 3, title: "Annual extensions", body: "Applied straight away. Your renewal date moves out, and you'll see the new date in the app." },
  { n: 4, title: "A year free", body: "Apple moves your next payment twelve months later. Your subscription carries on as normal, nothing is cancelled." },
];

const FAQ = [
  { q: "How do I earn points?", a: "Every approved review earns 1 point. Write 40 characters or more about your visit and that review is worth 2 points instead. A sentence or two is all it takes." },
  { q: "Do my reviews need photos?", a: "No. A description of 40 characters or more is what earns the second point. Photos are welcome and they help other dog owners, but they don't change your points." },
  { q: "What counts towards a point?", a: "An approved review of a dog-friendly place you've genuinely visited. Reviews are moderated, so only approved ones earn points." },
  { q: "What if my review isn't approved?", a: "Then it doesn't earn points. Reviews are moderated, and anything found to be fake, spammy or manipulated may have its rewards withheld or revoked. See our Terms of Use." },
  { q: "Do points expire?", a: "The 10 and 20 point tiers use a rolling 90-day window: you need the points earned in the last 90 days, and each is claimable once per period. The 50-point year free is a lifetime total, claimable once, ever." },
  { q: "I'm on the annual plan, how does a discount work for me?", a: "It doesn't. A percentage off a single yearly bill wouldn't come to much, so annual members get time added to their subscription instead: 30 days at 10 points, 90 days at 20. The year free at 50 points is the same for everyone." },
  { q: "What if a claim doesn't arrive?", a: "Email info@barkfind.com and we'll sort it out. Nothing is lost: if a claim fails, the points stay on your account and you can claim again." },
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

function PlanCard({ plan, tiers }: { plan: string; tiers: { points: number; reward: string; detail: string }[] }) {
  return (
    <div className="rounded-2xl border border-stone-100 bg-white shadow-sm shadow-stone-100 p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-[#585858] mb-4">{plan}</p>
      <ul className="flex flex-col">
        {tiers.map((t) => (
          <li key={t.points} className="flex items-center gap-3 py-3 border-t border-stone-100 first:border-t-0 first:pt-0">
            <span className="flex-shrink-0 w-12 h-12 rounded-full bg-[#FAEFD1] flex flex-col items-center justify-center leading-none">
              <span className="font-serif text-lg text-[#B74217]">{t.points}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#B74217]/70">pts</span>
            </span>
            <div>
              <p className="font-bold text-[#1a1a1a] text-sm">{t.reward}</p>
              <p className="text-sm text-[#585858]">{t.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] font-bold text-[#4FA4A1] uppercase tracking-widest mt-4">Rolling 90 days</p>
    </div>
  );
}

export default function Treats() {
  return (
    <PageShell
      title="How Treats work"
      subtitle="Review the places you go, and it comes back to you. Here's how BarkFind's rewards work, from your first review to the treat that lands on your bill."
    >
      <p className="text-[#444] leading-relaxed">
        Treats are our way of saying thank you. Every review you leave helps another owner work out whether they can
        bring their dog, and the more you add, the more you save on BarkFind. The app launches on iPhone soon, and
        Treats go live with it.
      </p>

      {/* Earning: points */}
      <Section title="How you earn points">
        <p>You earn <strong className="text-[#1a1a1a]">points</strong> for reviews, and a fuller review is worth more:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          {EARN.map((e) => (
            <div
              key={e.pts}
              className={`rounded-2xl p-6 flex flex-col gap-2 border ${
                e.highlight ? "bg-[#FAEFD1] border-[#B74217]/20" : "bg-white border-stone-100 shadow-sm shadow-stone-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-[#B74217]/10 flex items-center justify-center flex-shrink-0">
                  <PawMark className="w-5 h-5" color="#B74217" />
                </div>
                <p className="font-serif text-2xl text-[#1a1a1a]">{e.pts}</p>
              </div>
              <p className="text-sm text-[#585858] leading-relaxed">{e.body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-[#585858]">A sentence or two about your visit earns double. Only approved reviews count, and reviews are moderated.</p>
      </Section>

      {/* Rewards: differ by plan */}
      <Section title="What your points unlock">
        <p>
          What you get depends on your plan, because a percentage off doesn't make much sense on a single yearly bill.
          Same points, same 90-day window, different treat.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <PlanCard plan="Monthly plan" tiers={MONTHLY_TIERS} />
          <PlanCard plan="Annual plan" tiers={ANNUAL_TIERS} />
        </div>

        {/* 50 points: same for everyone */}
        <div className="rounded-2xl bg-[#B74217] text-white p-6 mt-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <PawMark className="w-6 h-6" color="#ffffff" />
          </div>
          <div>
            <p className="font-serif text-2xl">50 points: a year free</p>
            <p className="text-sm text-white/80">The same on either plan. Once per account, ever.</p>
          </div>
        </div>
      </Section>

      {/* How to redeem */}
      <Section title="How claiming works">
        <p>
          When Treats go live, you'll claim in the app under{" "}
          <strong className="text-[#1a1a1a]">Profile, then Treats</strong>. Here's what happens for each reward:
        </p>
        <div className="flex flex-col gap-5 mt-1">
          {REDEEM_STEPS.map((s) => (
            <Step key={s.n} {...s} />
          ))}
        </div>

        {/* Limits worth stating plainly */}
        <div className="rounded-xl bg-[#FAEFD1] border border-[#B74217]/15 p-5 mt-2 text-sm text-[#444] flex flex-col gap-2">
          <p><strong className="text-[#1a1a1a]">One claim per billing cycle.</strong> You can't stack several claims onto one bill.</p>
          <p><strong className="text-[#1a1a1a]">Up to three extensions a year.</strong> Apple allows a maximum of three subscription extensions per person per year, so annual members can claim at most three times in twelve months.</p>
        </div>

        <div className="rounded-xl border border-stone-100 bg-white p-4 mt-3 text-sm text-[#585858]">
          If a claim doesn't come through, email{" "}
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
          Nothing is lost: if a claim fails, the points stay on your account and you can claim again.
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
        <p>BarkFind is launching on iPhone soon. Join early access to be first in, and to lock in founding-member pricing, then start earning points from your very first review.</p>
        <a
          href="/#download"
          className="inline-flex items-center justify-center mt-1 px-7 py-3.5 rounded-full bg-[#B74217] text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-sm shadow-[#B74217]/25 self-start"
        >
          Get early access
        </a>
      </Section>
    </PageShell>
  );
}
