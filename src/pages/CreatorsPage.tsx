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
// fee/floor/cap are GBP; notice is days.
const PAY = { fee: 4, floor: 50, cap: 50, notice: 7 };

// Earnings calculator: React state only, no dependency, no form, nothing sent.
function EarningsCalculator() {
  const [subs, setSubs] = useState(10);
  const earned = subs * PAY.fee;

  let note: string;
  if (subs === 0) note = `Your first post still earns the £${PAY.floor} guarantee.`;
  else if (earned < PAY.floor) note = `Below the £${PAY.floor} guarantee, so your first post earns £${PAY.floor}.`;
  else note = `£${PAY.fee} per subscriber. Paid the month after they convert.`;
  if (subs === PAY.cap) note += ` That is the current cap on your code. We raise it once it is working.`;

  return (
    <div className="rounded-2xl px-6 py-5 border bg-[#FAEFD1] border-[#B74217]/20 shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-bold uppercase tracking-widest text-[#B74217]">Your earnings</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#B74217]" />
      </div>
      <label htmlFor="subs" className="block text-sm text-[#585858] mt-3">
        Confirmed subscribers: <span className="font-bold text-[#1a1a1a]">{subs}</span>
      </label>
      <input
        id="subs"
        type="range"
        min={0}
        max={PAY.cap}
        step={1}
        value={subs}
        onChange={(e) => setSubs(Number(e.target.value))}
        className="w-full mt-2 accent-rust"
      />
      <p className="font-serif text-4xl font-bold text-[#1a1a1a] mt-4">£{earned}</p>
      <p className="text-sm text-[#585858] leading-relaxed mt-1">{note}</p>
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
      <Section title="The problem we are fixing">
        <p>
          Most "dog friendly" is a guess. A pub that lets dogs in the garden but not the bar. A beach with
          a summer ban nobody mentioned. A café that was fine last year and is not now. BarkFind checks the
          venue's own dog policy, the council restrictions and what other owners found when they turned up,
          so people know before they set off.
        </p>
        <p>We launch on iPhone on 13 October 2026, UK only. Android is planned but not built.</p>
      </Section>

      <Section title="What we are asking for">
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
              <p className="font-bold text-base mb-1 text-[#1a1a1a]">20% off their first year</p>
              <p className="text-sm text-[#585858] leading-relaxed mt-2">
                £31.99 instead of £39.99, after a 14 day free trial. Then £39.99 a year unless they cancel.
              </p>
            </div>
            <p>
              Premium is the full app: dog-matched search, Ask Mylo, saving spots and recommendations matched
              to their dog. Browsing the map, opening any place and reading its dog policy and restrictions is
              free for everyone, with or without a subscription.
            </p>
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
          You are paid per person who uses your code and becomes a paying subscriber after their free trial,
          at £{PAY.fee} each. Downloads, trial starts and people who cancel during the trial are not counted,
          because we have not been paid for them either.
        </p>
        <p>
          Your first post carries a guaranteed £{PAY.floor} regardless of results, so you are not working for
          nothing if it does not land.
        </p>
        <p>
          Payment is monthly in arrears, by bank transfer, against the previous month's confirmed subscribers.
          Apple's 14 day trial means a post on the 1st produces its first confirmed subscribers around the
          15th, and the month settles about four weeks after the post. Your code carries a redemption limit of{" "}
          {PAY.cap}, which we can raise together once we have seen it work.
        </p>
        <EarningsCalculator />
      </Section>

      <Section title="How it is counted">
        <p>
          Apple counts every redemption of your code and reports it to us. We will send you that figure with
          each payment. There is no tracking of your followers, no cookies on our site and nothing collected
          about who they are. The code is the whole mechanism.
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
        <p>Three things, because each one turns into a refund request or a complaint.</p>
        <Bullets
          items={[
            <>
              The discount is on the first year. Do not say "forever", "locked in" or "for life". It renews at
              £39.99 unless cancelled.
            </>,
            <>
              Do not mention points, treats or rewards. They exist, they are for existing users, and they are
              not part of your offer.
            </>,
            <>
              Do not promise BarkFind covers everywhere. It covers a lot of the UK and some places are thin.
              "Check your area" is honest; "every pub in Britain" is not.
            </>,
          ]}
        />
      </Section>
      </div>

      <Section title="What we give you">
        <p>
          Founding creator credit on our site when the programme goes public. Early access to new features
          before they ship, and a direct line to the person building it. A say in what gets built next, because
          you hear from dog owners we do not.
        </p>
        <p>
          Assets on request: the app icon, screenshots, a short description in our words and the correct
          spelling of Mylo.
        </p>
      </Section>

      {/* Who you are working with: the shared rust StoryBand (from the beta "Meet
          Mylo" band), full-bleed so it spans the viewport inside PageShell's column.
          HELD: the Josh paragraph and both photos are placeholders until supplied. */}
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <StoryBand
          label="Who you are working with"
          paragraphs={[
            <p className="text-white/60 italic">[ Josh paragraph to be supplied ]</p>,
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
          <p className="mb-6">The short version of the agreement, written so it can be read in two minutes.</p>
          <ol className="flex flex-col gap-4 list-decimal pl-6 marker:font-bold marker:text-[#1a1a1a]">
            <li>
              Payment is per confirmed subscriber: someone who redeems your code, completes the free trial and
              pays for the first year, at £{PAY.fee} each. Apple's report of redemptions is the count we both use. Downloads, trial
              starts, cancellations during the trial and refunds do not count.
            </li>
            <li>
              Payment is made monthly, in arrears, by bank transfer, within 14 days of the end of each month.
              The first-post guarantee is paid with the first monthly payment.
            </li>
            <li>
              Your code carries a redemption cap of {PAY.cap}. Once it is reached, further redemptions are not possible until
              we raise it, which we will do together, in writing.
            </li>
            <li>
              We can pause, change or withdraw a code with {PAY.notice} days' notice, for example if the price,
              the discount or the programme changes. Subscribers who redeemed before the change are still paid
              for.
            </li>
            <li>
              We can withdraw a code immediately, without notice, if it is posted on a coupon or discount site,
              used for self-referral, shared in exchange for payment, or promoted with claims we have asked you
              not to make. Subscribers from that activity are not paid for.
            </li>
            <li>
              Every post mentioning BarkFind must carry an ad label, per the CAP Code. You are responsible for
              your posts complying with UK advertising law.
            </li>
            <li>
              Either of us can end the arrangement with {PAY.notice} days' notice. Confirmed subscribers up to
              the end date are still paid for.
            </li>
            <li>
              You are not an employee, agent or partner of BarkFind Ltd. You are responsible for your own tax.
            </li>
            <li>
              We will not use your name, handle, image or content in our marketing without asking first. You may
              use our name, icon and screenshots as supplied, for posts about BarkFind, and for nothing else.
            </li>
            <li>
              No exclusivity either way. You can work with other apps; we can work with other creators.
            </li>
            <li>
              We may update these terms. If we do, the new version applies to redemptions after the date shown
              below, and we will tell you before it changes.
            </li>
            <li>English law applies.</li>
          </ol>
          <p className="text-[#585858] mt-6">Version 1, 26 September 2026.</p>
        </div>
      </section>
    </PageShell>
  );
}
