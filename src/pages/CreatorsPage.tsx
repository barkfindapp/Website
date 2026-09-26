import PageShell, { Section, Bullets } from "../components/PageShell";
import { useSeo } from "../lib/seo";

// The public-facing creator programme page. Not linked from anywhere and not
// indexed: it is sent by link on purpose. When the programme opens up, the only
// change is adding a nav link and removing noindex. Static page, no data file,
// no form, no code, no slug. Numbers (fee, floor, cap) are set below.
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
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 sm:items-center">
          <div className="flex flex-col gap-4">
            <p>
              20% off their first year on the annual plan: £31.99 instead of £39.99, after a 14 day free
              trial. The trial is free and can be cancelled before it ends with nothing to pay.
            </p>
            <p>
              Premium is the full app: dog-matched search, Ask Mylo, saving spots and recommendations matched
              to their dog. Browsing the map, opening any place and reading its dog policy and restrictions is
              free for everyone, with or without a subscription.
            </p>
          </div>
          {/* Reused from the homepage app showcase (SCREENS "Discover" tab), same
              flat drop-shadow treatment PhoneShot uses. */}
          <img
            src="/media/showcase-discover.png"
            alt="BarkFind map screen showing dog-friendly places with paw pins"
            className="w-56 sm:w-64 flex-shrink-0 mx-auto drop-shadow-2xl"
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
          at £4 each. Downloads, trial starts and people who cancel during the trial are not counted, because
          we have not been paid for them either.
        </p>
        <p>
          Your first post carries a guaranteed £50 regardless of results, so you are not working for nothing
          if it does not land.
        </p>
        <p>
          Payment is monthly in arrears, by bank transfer, against the previous month's confirmed subscribers.
          Apple's 14 day trial means a post on the 1st produces its first confirmed subscribers around the
          15th, and the month settles about four weeks after the post. Your code carries a redemption limit of
          50, which we can raise together once we have seen it work.
        </p>
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
        <div className="flex items-center gap-4">
          {/* The square brand mark used as the site favicon (public/barkfind-paw-logo.png). */}
          <img
            src="/barkfind-paw-logo.png"
            alt="BarkFind app icon"
            className="w-16 h-16 flex-shrink-0 object-contain"
          />
          <p>
            Assets on request: the app icon, screenshots, a short description in our words and the correct
            spelling of Mylo.
          </p>
        </div>
      </Section>

      <Section title="Get in touch">
        <p>
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
          One person reads it and it is the same person who built the app.
        </p>
      </Section>
    </PageShell>
  );
}
