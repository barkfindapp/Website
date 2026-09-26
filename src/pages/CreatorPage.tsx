import { useRef, useState } from "react";
import PageShell from "../components/PageShell";
import EarlyAccessForm from "../components/EarlyAccessForm";
import { useSeo } from "../lib/seo";
import { isAndroid } from "../lib/platform";
import { LAUNCHED } from "../data/launch";
import { CREATORS, type Creator } from "../data/creators";

// The tracker for this page is the creator's Apple offer code, counted as
// redemptions in App Store Connect and filtered by code. There is no
// website-side attribution and none is wanted: RevenueCat attribution is not
// wired and the Apple redeem URL carries no campaign parameters. Do not
// "improve" this by bolting tracking params onto the redeem link; the code is
// the tracker. Page-view analytics would be a nice secondary metric but the
// site loads no analytics, so none is fired here (reported as a gap).
const APP_STORE_ID = "6782144377";
const redeemUrl = (code: string) =>
  `https://apps.apple.com/redeem?ctx=offercodes&id=${APP_STORE_ID}&code=${code}`;

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLSpanElement>(null);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some in-app browsers (Instagram, TikTok),
      // which is exactly where these visitors are. Select the code so it can be
      // copied by hand rather than throwing.
      const el = codeRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl bg-cream border border-rust/15 p-4">
        <span
          ref={codeRef}
          className="flex-1 font-mono text-xl font-bold tracking-wider text-ink select-all break-all"
        >
          {code}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="px-4 py-2 rounded-full bg-rust text-white text-sm font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink/60">
        Applied automatically if you tap the button below. If it is not, paste it in on the App Store.
      </p>
    </div>
  );
}

function NotFound() {
  useSeo({
    title: "This link is no longer active | BarkFind",
    description: "This BarkFind link is no longer active.",
    path: "/with",
    noindex: true,
  });
  return (
    <PageShell title="This link is no longer active">
      <p className="text-ink/75">You can still get BarkFind from the homepage.</p>
      <a href="/" className="inline-block mt-4 text-rust font-semibold hover:underline">
        Go to the homepage
      </a>
    </PageShell>
  );
}

function CreatorContent({ creator }: { creator: Creator }) {
  useSeo({
    title: `${creator.displayName} sent you | BarkFind`,
    description: `${creator.displayName} sent you to BarkFind.`,
    path: `/with/${creator.slug}`,
    noindex: true,
  });
  const android = isAndroid();

  return (
    <PageShell
      compact
      eyebrow={`${creator.displayName} sent you`}
      title="Somewhere your dog is actually welcome, not just tolerated"
    >
      <div className="max-w-md">
        <p className="text-ink/75 leading-relaxed">
          BarkFind checks the dog policy, the council restrictions and what other owners found when they
          turned up, so you know before you set off. {creator.displayName}'s link gets you the
          founding-member price: your first year for £19.99 instead of £39.99, after a 14 day free trial.
        </p>

        {LAUNCHED ? (
          <>
            <div className="mt-6">
              <CodeBlock code={creator.offerCode} />
            </div>
            <div className="mt-6">
              {android ? (
                <div className="rounded-2xl bg-ink p-5">
                  <p className="text-white text-sm mb-4">
                    BarkFind is on iPhone first. Leave your email and you will hear the day it reaches Android.
                  </p>
                  <EarlyAccessForm platform="android" buttonLabel="Notify me" compact />
                </div>
              ) : (
                <a
                  href={redeemUrl(creator.offerCode)}
                  className="block text-center px-6 py-4 rounded-full bg-rust text-white font-bold hover:opacity-90 transition-opacity"
                >
                  Get the app with {creator.displayName}'s code
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl bg-ink p-5">
            <p className="text-white text-sm mb-4">
              {creator.displayName}'s code will be waiting for you on launch day.
            </p>
            <EarlyAccessForm platform={android ? "android" : "ios"} buttonLabel="Get early access" compact />
          </div>
        )}

        <p className="mt-4 text-xs text-ink/60 leading-relaxed">
          iPhone only for now. First year at £19.99, then £39.99 a year unless you cancel. Cancel any time
          during the free trial and you pay nothing.
        </p>
      </div>
    </PageShell>
  );
}

export default function CreatorPage({ slug }: { slug: string }) {
  const creator = CREATORS.find((c) => c.slug === slug && c.active);
  // Resolve not-found in a sub-component so hooks run unconditionally.
  return creator ? <CreatorContent creator={creator} /> : <NotFound />;
}
