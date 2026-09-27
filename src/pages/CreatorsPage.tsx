import { useState } from "react";
import PageShell, { Section, Bullets } from "../components/PageShell";
import StoryBand from "../components/StoryBand";
import { useSeo } from "../lib/seo";

// The public-facing creator programme page. Not linked from anywhere and not
// indexed: it is sent by link on purpose. When the programme opens up, the only
// change is adding a nav link and removing noindex. Static page, no data file,
// no code, no slug.

// Single source of truth for the programme numbers, used by the prose, the
// earnings calculator and the terms so the page cannot disagree with itself.
export const NOTICE_DAYS = 7;

export type Tier = {
  id: "small" | "mid";
  label: string; // shown to the creator
  minFollowers: number; // inclusive
  maxFollowers: number; // exclusive
  fee: number; // £ per paying subscriber
  guarantee: number; // £ guaranteed on first post
  cap: number; // how many people the code works for
};

export const TIERS: Tier[] = [
  { id: "small", label: "Under 10,000", minFollowers: 0, maxFollowers: 10000, fee: 4, guarantee: 50, cap: 50 },
  { id: "mid", label: "10,000 to 30,000", minFollowers: 10000, maxFollowers: 30000, fee: 6, guarantee: 100, cap: 100 },
];

export const BESPOKE_FROM = 30000; // at or above this, no published rate

export function tierFor(followers: number): Tier | null {
  if (followers >= BESPOKE_FROM) return null;
  return TIERS.find((t) => followers >= t.minFollowers && followers < t.maxFollowers) ?? TIERS[0];
}

const fmt = (n: number) => n.toLocaleString("en-GB");

// Earnings calculator: React state only, no dependency, no form, nothing sent.
// The tier is chosen by three tabs (the two published tiers plus bespoke).
function EarningsCalculator() {
  const [tab, setTab] = useState(0); // 0..TIERS.length-1 -> a tier; last -> bespoke
  const [subs, setSubs] = useState(() => Math.min(10, TIERS[0].cap));
  const tier = tab < TIERS.length ? TIERS[tab] : null;

  const tabLabels = [...TIERS.map((t) => t.label), `Over ${fmt(BESPOKE_FROM)}`];

  const selectTab = (i: number) => {
    setTab(i);
    const t = i < TIERS.length ? TIERS[i] : null;
    if (t && subs > t.cap) setSubs(t.cap); // clamp to the new tier's cap
  };

  // The whole card takes the selected tier's colour. Under 10,000 -> teal,
  // 10,000-30,000 -> sand, Over 30,000 -> rust. Sand is a light fill, so that
  // card uses dark ink text; teal and rust cards use white text.
  const CARDS = [
    { fill: "bg-teal", light: false }, // under 10,000
    { fill: "bg-[#FAEFD1]", light: true }, // 10,000-30,000 (sand)
    { fill: "bg-rust", light: false }, // over 30,000
  ];
  const card = CARDS[tab] ?? CARDS[2];
  const onLight = card.light;
  const strong = onLight ? "text-ink" : "text-white";
  const muted = onLight ? "text-ink/70" : "text-white/85";
  const dot = onLight ? "bg-ink/70" : "bg-white/85";

  return (
    <div className={`rounded-2xl px-6 py-5 border border-transparent shadow-sm transition-colors ${card.fill} ${strong}`}>
      <div className="flex items-center gap-3 mb-1">
        <span className={`text-xs font-bold uppercase tracking-widest ${muted}`}>Your earnings</span>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      </div>

      {/* Tier tabs: the tab is the tier. A caption names what the numbers count.
          Active pill inverts to solid white; inactive are translucent pills that
          read on the card. Each is keyboard-reachable. */}
      <p className={`text-sm mt-3 ${muted}`}>Your followers</p>
      <div role="tablist" aria-label="Follower tier" className="flex flex-wrap gap-2 mt-2">
        {tabLabels.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={tab === i}
            onClick={() => selectTab(i)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              tab === i
                ? "bg-white text-ink shadow-sm border border-black/5"
                : onLight
                  ? "bg-white/40 text-ink/70 hover:bg-white/70 border border-ink/15"
                  : "bg-white/15 text-white hover:bg-white/25 border border-white/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tier ? (
        <TierEarnings tier={tier} subs={subs} setSubs={setSubs} onLight={onLight} />
      ) : (
        <div className="mt-4">
          <p className={`text-sm ${muted}`}>Over {fmt(BESPOKE_FROM)} followers, let's have a chat.</p>
          <a
            href="mailto:info@barkfind.com?subject=Creator%20programme"
            className={`inline-block mt-3 text-2xl font-serif font-bold hover:underline ${strong}`}
          >
            Get in touch
          </a>
        </div>
      )}
    </div>
  );
}

// Input 2 and the output. Split out so the bespoke tier can drop it entirely.
// The progress bar mirrors the in-app control: a chunky, fully-rounded two-tone
// bar with a rust fill over a lighter track (track colour adapts to the card).
function TierEarnings({
  tier,
  subs,
  setSubs,
  onLight,
}: {
  tier: Tier;
  subs: number;
  setSubs: (n: number) => void;
  onLight: boolean;
}) {
  const earned = Math.max(subs * tier.fee, tier.guarantee);
  const pct = tier.cap === 0 ? 0 : (subs / tier.cap) * 100;
  const track = onLight ? "rgba(47,41,30,0.15)" : "rgba(255,255,255,0.35)";
  const strong = onLight ? "text-ink" : "text-white";
  const muted = onLight ? "text-ink/70" : "text-white/85";

  let note: string;
  if (subs === 0) note = `Your first post still earns the £${tier.guarantee} guarantee.`;
  else if (subs * tier.fee < tier.guarantee) note = `Below the £${tier.guarantee} guarantee, so your first post earns £${tier.guarantee}.`;
  else note = `£${tier.fee} for each paying subscriber, paid the month after they start paying.`;
  if (subs === tier.cap) note += ` That is as many as your code allows. Reach it and you move up a tier.`;

  return (
    <>
      <label htmlFor="subs" className={`block text-sm mt-4 ${muted}`}>
        Paying subscribers: <span className={`font-bold ${strong}`}>{subs}</span>
      </label>
      {/* Rust fill up to the current value, lighter track after: the app's bar look.
          A small white thumb keeps it grabbable. */}
      <input
        id="subs"
        type="range"
        min={0}
        max={tier.cap}
        step={1}
        value={subs}
        onChange={(e) => setSubs(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, #B74217 0%, #B74217 ${pct}%, ${track} ${pct}%, ${track} 100%)`,
        }}
        className="w-full mt-3 h-2.5 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/10
          [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:bg-transparent"
      />
      <p className={`font-serif text-4xl font-bold mt-4 ${strong}`}>£{earned}</p>
      <p className={`text-sm leading-relaxed mt-1 ${muted}`}>{note}</p>
    </>
  );
}

// FAQ accordion: one panel open at a time, each question a button with
// aria-expanded. Figures come from the first tier (TIERS[0]), never hardcoded.
function Questions() {
  const t = TIERS[0];
  const guarantee = t.guarantee;
  const fee = t.fee;
  const cap = t.cap;
  const breakeven = Math.ceil(guarantee / fee); // subscribers where per-head beats the guarantee

  const items: { q: string; a: string }[] = [
    {
      q: `Do I get the £${guarantee} just for posting?`,
      a: `Yes, your first post is guaranteed at least £${guarantee}, whatever happens. Once you pass ${breakeven} subscribers, you earn £${fee} each instead, because that is worth more. So 0 subscribers is £${guarantee}, 20 is £${20 * fee}, ${cap} is £${cap * fee}. It is one or the other, whichever is higher, not both added together. After the first post there is no minimum, just £${fee} per subscriber.`,
    },
    {
      q: `I have more than one account. Which one counts?`,
      a: `You get one code, linked to you rather than a handle, so share it from every account you have. Your tier is set by the largest of them. Apple tells us how many people used a code, not where they came from, so one code across all your accounts is the only way it works, and the more places it appears, the better for both of us.`,
    },
    {
      q: `What happens when my code hits its limit?`,
      a: `It stops working, you move up a tier, and we send you a new code at the next rate. The people who used the first code are still paid for.`,
    },
    {
      q: `How do I know how many people have used my code?`,
      a: `We email you a count at the end of every month, straight from Apple's report, with the payment. If you want a number mid-month, ask.`,
    },
    {
      q: `When do I actually get paid?`,
      a: `By bank transfer within 14 days of the end of each month, for the month before. Because of Apple's 14 day free trial, a post on the 1st brings its first paying subscribers around the 15th, so expect your first payment about six weeks after your first post.`,
    },
    {
      q: `Do I have to say it is an ad?`,
      a: `Yes, every time, at the start of the post. That is UK law for any post where you are being paid, and a fine from the ASA lands on you, not us. "Ad" or "Paid partnership" is enough.`,
    },
    {
      q: `Can I try the app before I post about it?`,
      a: `Yes. Ask and we will add you to the test build before launch. Post about what you actually find, including the bits that need work. It is more believable and we would rather know.`,
    },
    {
      q: `Do I have to show my face?`,
      a: `No. Your dog, the app, a walk, a pub garden. Whatever your account normally does.`,
    },
    {
      q: `How many posts do you expect?`,
      a: `One to start with. If it works for both of us, we talk about more. There is no minimum and no schedule.`,
    },
    {
      q: `Can I work with other apps?`,
      a: `Yes. No exclusivity in either direction.`,
    },
    {
      q: `What do my followers actually get?`,
      a: `20% off their first year of Premium, £31.99 instead of £39.99, with the free trial still included. It works on iPhone; Android is coming.`,
    },
    {
      q: `What can I not do with the code?`,
      a: `Post it on a discount or coupon site, use it to sign yourself up, or sell it. Any of those and the code is stopped straight away.`,
    },
    {
      q: `Do I need to invoice you, and what about tax?`,
      a: `No invoice. We pay against Apple's count and email you the breakdown. You are not employed by us, so any tax on what you earn is yours to sort out.`,
    },
  ];

  const [open, setOpen] = useState(0); // index of the open panel, -1 for none

  return (
    <div className="border-t border-stone-200">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className="border-b border-stone-200">
            <h3 className="m-0">
              <button
                type="button"
                id={`faq-btn-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="w-full flex items-center justify-between gap-4 text-left py-4 font-bold text-[#1a1a1a] hover:text-[#B74217] transition-colors"
              >
                <span>{item.q}</span>
                <span aria-hidden="true" className={`flex-shrink-0 text-[#B74217] transition-transform ${isOpen ? "rotate-180" : ""}`}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            </h3>
            {isOpen && (
              <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-btn-${i}`} className="pb-4 -mt-1 text-[#444] leading-relaxed">
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CreatorsPage() {
  useSeo({
    title: "Creators | BarkFind",
    description: "The BarkFind creator programme: how it works and how you are paid.",
    path: "/creators",
    noindex: true,
  });

  return (
    <PageShell eyebrow="Working with BarkFind" title="Creators">
      <Section title="Dog friendly, done differently">
        <p>
          Most "dog friendly" is a guess. A pub that lets dogs in the garden but not the bar. A beach with
          a summer ban nobody mentioned. A café that was fine last year and is not now. BarkFind checks the
          venue's own dog policy, the council restrictions and what other owners found when they turned up,
          so people know before they set off.
        </p>
        <p>We launch on iPhone on 13 October 2026, UK only. Android is planned but not built.</p>
      </Section>

      <Section title="How you can help">
        <p>
          An honest post. You have followers who own dogs, and they trust what you say about where you take
          yours. We would like you to try BarkFind with your own dog, in your own area, and tell them what you
          found. If it fell short somewhere, say so. A post that reads like an advert does worse for both of us
          than one that reads like you.
        </p>
        <p>
          We do not script posts, approve scripts, or ask for edits, with one exception found below in{" "}
          <a href="#what-not-to-say" className="text-[#B74217] font-semibold hover:underline">What not to say</a>.
        </p>
      </Section>

      <Section title="What your followers get">
        {/* Two columns like the homepage AppShowcase (text left, phone right), top-aligned
            so the content starts level with the top of the phone. Stacks on mobile. */}
        <div className="flex flex-col sm:flex-row gap-8 sm:items-start">
          <div className="flex flex-col gap-4">
            {/* Same offer card as the /with/ page: cream fill, rust border, small-caps label. */}
            <div className="rounded-2xl px-6 py-5 border bg-[#FAEFD1] border-[#B74217]/20 shadow-sm">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-bold uppercase tracking-widest text-[#B74217]">Their offer</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#B74217]" />
              </div>
              <p className="font-bold text-base mb-1 text-[#1a1a1a]">20% off their first Annual Premium subscription</p>
              <p className="text-sm text-[#585858] leading-relaxed mt-2">
                £31.99 instead of £39.99, after a 14 day free trial. Then £39.99 a year unless they cancel.
              </p>
            </div>
            <p className="font-semibold text-[#1a1a1a]">BarkFind Premium gives users:</p>
            <Bullets
              items={[
                "Search built around their dog, not just what's nearby",
                "Save new spots as they find them",
                "Recommendations matched to their dog's temperament, size and how they cope indoors",
                "Ask Mylo: 60 questions a day",
                "Browsing the map, opening any place and reading its dog policy and restrictions is free for everyone, with or without a subscription.",
              ]}
            />
          </div>
          {/* Reused from the homepage app showcase (SCREENS "Discover" tab), same flat
              drop-shadow treatment PhoneShot uses, at the homepage's w-60. */}
          <img
            src="/media/showcase-discover.png"
            alt="BarkFind map screen showing dog-friendly places with paw pins"
            className="w-60 flex-shrink-0 mx-auto drop-shadow-2xl"
          />
        </div>
      </Section>

      <Section title="How it works">
        <p>
          You get a page on our site at barkfind.com/with/yourname and a code. The page shows your code and a
          button that opens the App Store with the code already applied, so nobody has to remember or type
          anything. Put the link in your bio and your stories, and say the code out loud in video for anyone
          watching without sound.
        </p>
        <p>Your code is unique to you. That is how we know a subscriber came from you.</p>
      </Section>

      <Section title="How you are paid">
        <p>
          What we pay depends on the size of your audience when your code is issued. We use whichever of your
          TikTok or Instagram followings is larger, and your tier stays the same for as long as that code is live.
        </p>
        {/* Three tier cards, matching the Business.tsx card convention (rounded-2xl
            white card, stone border, soft shadow): the two published tiers plus a
            bespoke card for over 30,000. */}
        <div className="flex flex-col gap-4 mt-2">
          {TIERS.map((t) => (
            <div key={t.id} className="rounded-2xl bg-white border border-stone-100 shadow-sm p-6">
              <h3 className="font-bold text-[#1a1a1a] mb-1">{t.label} followers</h3>
              <p className="text-sm text-[#585858] leading-relaxed">
                £{t.fee} for every paying subscriber, a guaranteed £{t.guarantee} on your first post, and your code
                works for up to {t.cap} people.
              </p>
            </div>
          ))}
          <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-6">
            <h3 className="font-bold text-[#1a1a1a] mb-1">Over {fmt(BESPOKE_FROM)} followers</h3>
            <p className="text-sm text-[#585858] leading-relaxed">
              <a href="mailto:info@barkfind.com?subject=Creator%20programme" className="text-[#B74217] font-semibold hover:underline">Get in touch</a>{" "}
              and we will have a chat about what works for you.
            </p>
          </div>
        </div>
        <p>
          A paying subscriber is someone who uses your code and pays for their first year after the free
          trial. Downloads, trial starts and people who cancel during the trial are not counted, because we
          have not been paid for them either.
        </p>
        <p>
          Whatever the tier, you get BarkFind Premium free for as long as you are part of the programme. If your
          first post uses up all of its code, you move up a tier for the next one.
        </p>
        <p>
          You are paid once a month, by bank transfer, for the previous month's paying subscribers, so each
          payment lands after the month it covers. Because Apple runs a 14 day trial, a post on the 1st brings
          its first paying subscribers around the 15th, and that month is settled about four weeks later.
        </p>
        <EarningsCalculator />
      </Section>

      <Section title="How it is counted">
        <p>
          Apple counts every time someone uses your code and tells us the number. We will send you that figure
          with each payment. There is no tracking of your followers, no cookies on our site and nothing
          collected about who they are. The code is the whole mechanism.
        </p>
      </Section>

      <Section title="What you must do">
        <p>
          Every post, story and video that mentions BarkFind must be labelled as an ad. In the UK that is the
          law, not our preference. "Ad" or "Paid partnership" at the start, visible without tapping "more".
          Performance-based pay is still pay.
        </p>
      </Section>

      <div id="what-not-to-say" className="scroll-mt-24">
      <Section title="What not to say">
        <p>Three things, because each one could turn into a refund request or a complaint.</p>
        <Bullets
          items={[
            <>
              The discount is on the first year. Do not say "forever", "locked in" or "for life". It renews at
              £39.99 unless cancelled.
            </>,
            <>
              Treats, the points people earn for honest reviews, are a real feature and you are welcome to show
              them. Just keep them separate from your discount. "Reviews earn treats" is fine; "use my code and
              earn treats" is not, because the code has nothing to do with them.
            </>,
            <>
              Do not promise BarkFind covers everywhere. It covers a lot of the UK and some places are thin, and
              that is worth saying out loud: it is built by the people who use it. If somewhere is missing,
              recommend it in the app's settings area, or get in touch with us directly, and it gets added once
              checked. "Check your area, and add what is missing" is honest; "every pub in Britain" is not.
            </>,
          ]}
        />
      </Section>
      </div>

      <Section title="What we give you">
        <p>
          Founding creator credit on our site when the programme goes public. Early access to new features
          before they go live, and a direct line to the person building it. A say in what gets built next,
          because you hear from dog owners we do not.
        </p>
        <p>
          Assets on request: the app icon, screenshots, a short description in our words and the correct
          spelling of Mylo.
        </p>
      </Section>

      <Section title="Questions">
        <Questions />
      </Section>

      {/* Who you are working with: the shared rust StoryBand (from the beta "Meet
          Mylo" band), full-bleed so it spans the viewport inside PageShell's column.
          mt-14 gives the same top gap the terms band has. */}
      <div className="mt-14 relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <StoryBand
          label="Who you are working with"
          paragraphs={[
            <p>I am Josh. I built BarkFind from Weston-super-Mare with two dogs, Mylo and Ralph, and one too many afternoons cut short because the only free table was the one by the door.</p>,
            <p>The Mylo in the app is named after the real one: my first dog, a Hungarian Vizsla who is very particular about his ideal location.</p>,
            <p>There is no team, no office and no investor. It is me, a laptop, and twelve months of evenings and weekends, which is also why the terms below are short and the email gets answered.</p>,
          ]}
          photos={[
            { alt: "Josh with both dogs on the beach", src: "/media/creator-josh.jpg", placeholderLabel: "Photo of Josh with both dogs" },
            { alt: "Mylo the Vizsla out on the beach", src: "/media/creator-mylo.jpg", placeholderLabel: "Photo of Mylo out and about" },
          ]}
        />
      </div>

      <Section title="Get in touch">
        <p>
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
          One person reads it and it is the same person who built the app.
        </p>
      </Section>

      {/* Full-bleed cream band matching the PageShell hero; content stays in the
          standard max-w-3xl column. The break-out escapes PageShell's content column. */}
      <section className="mt-14 -mb-14 bg-[#FAEFD1] relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <div className="max-w-3xl mx-auto px-6 py-14 text-[#444] leading-relaxed">
          <p className="text-sm font-bold uppercase tracking-widest text-[#B74217] mb-2">Terms</p>
          <h2 className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-4">The terms</h2>
          <p className="mb-6">The short version, written so you can read it in two minutes.</p>
          <ol className="flex flex-col gap-4 list-decimal pl-6 marker:font-bold marker:text-[#1a1a1a]">
            <li>
              You are paid for each person who uses your code, finishes the free trial and pays for their first
              year. What you get per person depends on your tier, set out under "How you are paid" above:{" "}
              £{TIERS[0].fee} under {fmt(TIERS[0].maxFollowers)} followers, £{TIERS[1].fee} from{" "}
              {fmt(TIERS[1].minFollowers)} to {fmt(BESPOKE_FROM)}, and a figure we agree in writing above that.
              We both go by Apple's count of code uses. Downloads, trial starts, cancellations during the trial
              and refunds do not count.
            </li>
            <li>
              You are paid each month by bank transfer, within 14 days of the month ending, for the month just
              gone. Your first-post guarantee comes with that first payment.
            </li>
            <li>
              Each code works for a set number of people, {TIERS[0].cap} or {TIERS[1].cap} depending on your
              tier. Once it is used up it stops, until we raise the limit together, in writing. If your first
              post uses up its code, your next one starts at the tier above.
            </li>
            <li>
              Your tier comes from whichever is higher, your TikTok or Instagram following, on the day your code
              is issued and as shown on your public profile. It stays the same while that code is live. We might
              ask for a screenshot of the number.
            </li>
            <li>
              BarkFind Premium is free for you while you are in the programme, and stops when you leave it.
            </li>
            <li>
              We can pause, change or stop a code by telling you {NOTICE_DAYS} days ahead, for instance if the
              price, the discount or the programme changes. Anyone who used it before the change is still paid
              for.
            </li>
            <li>
              We can stop a code straight away, with no notice, if it turns up on a coupon or discount site, is
              used to sign yourself up, is sold, or is promoted with claims we have asked you not to make. We do
              not pay for subscribers who come from that.
            </li>
            <li>
              Every post that mentions BarkFind needs an ad label, as the CAP Code requires. Keeping your posts
              within UK advertising law is down to you.
            </li>
            <li>
              Either of us can end things by giving the other {NOTICE_DAYS} days' notice. Everyone who paid up
              to that end date is still paid for.
            </li>
            <li>
              You are not employed by BarkFind Ltd, and not our agent or partner. Your own tax is yours to sort
              out.
            </li>
            <li>
              We will not put your name, handle, image or posts in our marketing without asking you first. You
              are welcome to use our name, icon and screenshots as we supply them, for posts about BarkFind and
              nothing else.
            </li>
            <li>
              No exclusivity either way. You can work with other apps; we can work with other creators.
            </li>
            <li>
              We might update these terms. If we do, the new version covers code uses after the date shown
              below, and we will tell you before anything changes.
            </li>
            <li>If a dispute ever comes up, English law applies.</li>
          </ol>
          <p className="text-[#585858] mt-6">Version 2, 27 September 2026.</p>
        </div>
      </section>
    </PageShell>
  );
}
