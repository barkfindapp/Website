import PageShell, { Section, Bullets } from "../components/PageShell";
import StoryBand from "../components/StoryBand";
import { ANDROID_LIVE, APP_STORE_URL } from "../data/launch";
import { GooglePlayButton } from "../components/StoreButtons";
import { useSeo, faqSchema, breadcrumbSchema, organizationSchema } from "../lib/seo";

// Reactive-dogs pillar page: /reactive-dogs. A hand-authored hub, so it lives as
// a static marketing route (like /business and /creators) rather than in the
// DB-driven Discover section. Indexed on purpose: this is the page we want
// ranking for "reactive dog days out", "dog-friendly places with space" and the
// like, and the anchor that future reactive-first guides link back to.
//
// Voice: reactivity-led (owned, long-form channel). Everything here is owner
// experience and real app behaviour. It deliberately stops short of behaviour
// advice: for that, it points people to a qualified behaviourist.

// Real reactive-owner questions. Doubles as the on-page FAQ and the FAQ schema,
// so the two can never drift apart.
const FAQ: { q: string; a: string }[] = [
  {
    q: "What makes somewhere good for a reactive dog, not just dog-friendly?",
    a: "Tolerating dogs and suiting a reactive one are different things. A reactive dog needs room between tables, a corner away from the door, sightlines so nothing appears without warning, and ideally space outside where another dog is not about to walk straight past. BarkFind is built to tell you those things before you set off, from the venue's own policy and from what other owners found when they turned up.",
  },
  {
    q: "Can I find places with space away from other dogs?",
    a: "That is the point of it. Each place shows its dog policy, any council restrictions, and photos and notes from owners who have been. Where owners have told us a place has an enclosed field, off-lead space, a quiet corner or room to spread out, you will see it on the place's page. Coverage is uneven and it is built by the people who use it, so some places have more detail than others.",
  },
  {
    q: "My dog is fine with people but not other dogs. Does that help?",
    a: "Yes. That is a fact about your dog, and it is exactly the kind of thing the app is built around. In Premium you can set your dog's temperament, size and how they cope indoors, and recommendations are matched to that rather than to dogs in general. Browsing the map and reading any place's policy is free, with or without a subscription.",
  },
  {
    q: "Does BarkFind show secure or enclosed dog fields?",
    a: "Where owners have reported one, yes, on that place's page. We do not claim to list every secure field in the country, because we do not, and saying otherwise would send you somewhere that turns out not to exist. If you know one that is missing, add it in the app and it gets checked and included.",
  },
  {
    q: "Is it free?",
    a: "Browsing the map, opening any place and reading its dog policy and restrictions is free for everyone. BarkFind Premium adds search built around your dog, recommendations matched to their temperament and size, saved places and Ask Mylo. It is £5.99 a month or £39.99 a year, on iPhone, UK only.",
  },
  {
    q: "Do you cover my area?",
    a: "Honestly, it depends where you are. Coverage is strongest around Weston-super-Mare, Bristol and Somerset, and thinner the further out you go, because real owners build it place by place. Check your area in the app. If a place you trust is missing, add it, and it is included once checked.",
  },
  {
    q: "How do you know a place is actually good, and not just letting dogs in?",
    a: "Three sources, not one. The venue's own dog policy, any council restrictions that apply, and what other owners found on the day. A place that lets dogs in the garden but not the bar, or a beach with a summer ban, shows up as exactly that, rather than a flat 'dogs welcome'.",
  },
];

export default function ReactiveDogs() {
  useSeo({
    title: "Dog-friendly places for reactive dogs | BarkFind",
    description:
      "Reactive dogs need space, quiet corners and somewhere other dogs are not about to walk past. BarkFind helps you find places that genuinely suit a reactive dog, not just tolerate one.",
    path: "/reactive-dogs",
    jsonLd: [organizationSchema, breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Reactive dogs", path: "/reactive-dogs" },
    ]), faqSchema(FAQ)],
  });

  return (
    <PageShell
      eyebrow="For reactive dogs"
      title="Places that suit a reactive dog, not just tolerate one"
      subtitle="A reactive dog cannot settle just anywhere. BarkFind helps you find the places that work: room to spread out, a corner away from the door, and space where another dog is not about to appear."
    >
      <Section title="Why this is the thing we care about most">
        <p>
          BarkFind was built around one dog. Mylo is a Vizsla, and he is reactive: he cannot walk into
          every room and settle. The whole app comes from one ordinary problem, turning up somewhere that
          calls itself dog-friendly and finding the only free table is the one by the door, with a terrier
          two feet away and nowhere to move to.
        </p>
        <p>
          If your dog is the same, you already know the drill. You plan more than other owners. You read the
          room from the doorway. You leave early more often than you would like. Most "dog-friendly" lists
          are no use to you, because they answer "are dogs allowed" when your question is "can my dog cope
          here". That is the question BarkFind is built to answer.
        </p>
      </Section>

      <Section title="What a reactive dog actually needs from a place">
        <p>
          Reactive is not naughty, and it is not a training failure. It is a fact about a dog, the same as
          size or age. What it means in practice is that a place has to earn its welcome in ways a confident
          dog never notices:
        </p>
        <Bullets
          items={[
            "Room between tables, so nobody squeezes past your dog to reach the bar.",
            "A corner or a wall to sit against, away from the door, where surprises do not come from behind.",
            "Sightlines, so you see a dog coming in time to move or to leave.",
            "Space outside: a beer garden with gaps, a field, somewhere off-lead if your dog needs distance.",
            "Water, and somewhere to settle rather than a thoroughfare.",
            "Staff who understand a dog needing space, and do not march over to say hello.",
          ]}
        />
        <p>
          None of that shows up in a "dogs welcome" sign. It shows up when someone who has actually sat there
          with a dog tells you. That is what the app collects.
        </p>
      </Section>

      <Section title="How BarkFind helps, specifically">
        <p>
          Every place shows its real dog policy, any council restrictions, and what other owners found when
          they visited, including photos of the actual space rather than the one good corner. So you can see
          whether there is room before you commit the afternoon to it.
        </p>
        <Bullets
          items={[
            <>
              <strong>Read the place before you go.</strong> Policy, restrictions and owner photos on every
              place, free to browse, with or without a subscription.
            </>,
            <>
              <strong>Search built around your dog.</strong> In Premium, set your dog's temperament, size and
              how they cope indoors, and get places matched to that, not to dogs in general.
            </>,
            <>
              <strong>Ask Mylo.</strong> The in-app assistant, named after the real Mylo. Ask it things like
              "a calm cafe where my anxious rescue can settle, with water and space away from the door" and
              it works from the same place data you can see.
            </>,
            <>
              <strong>Add what is missing.</strong> Found a genuinely good one, or a quiet field nobody lists?
              Add it, and once it is checked, the next owner finds it too.
            </>,
          ]}
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={APP_STORE_URL}
            className="inline-flex items-center gap-2 w-fit px-5 py-2.5 rounded-full bg-[#B74217] text-white text-sm font-bold hover:bg-[#333333] transition-colors shadow-sm shadow-[#B74217]/30"
          >
            {ANDROID_LIVE ? "Get BarkFind" : "Get BarkFind on iPhone"}
          </a>
          {ANDROID_LIVE && (
            <GooglePlayButton className="inline-flex items-center gap-2 w-fit px-5 py-2.5 rounded-full bg-[#1a1a1a] text-white text-sm font-bold hover:bg-[#333333] transition-colors shadow-sm" />
          )}
        </div>
      </Section>

      <Section title="Start exploring">
        <p>
          The place to begin is the map and the town guides. Open a guide for where you are headed, read the
          honest notes on each place, and look for the ones with space and an easy exit.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          <a
            href="/discover"
            className="flex-1 rounded-2xl bg-white border border-stone-100 shadow-sm p-6 hover:border-[#B74217]/30 transition-colors"
          >
            <h3 className="font-bold text-[#1a1a1a] mb-1">Discover dog-friendly places</h3>
            <p className="text-sm text-[#585858] leading-relaxed">
              Town guides, news and events, sorted by where you are going.
            </p>
          </a>
          <a
            href="/dog-friendly?reactive=1"
            className="flex-1 rounded-2xl bg-white border border-stone-100 shadow-sm p-6 hover:border-[#B74217]/30 transition-colors"
          >
            <h3 className="font-bold text-[#1a1a1a] mb-1">Guides with reactive-friendly places</h3>
            <p className="text-sm text-[#585858] leading-relaxed">
              The town guides, filtered to places with space, an enclosure or room away from other dogs.
            </p>
          </a>
        </div>
      </Section>

      <Section title="A word on the hard days">
        <p>
          Finding the right place helps, but it is only half of it. If your dog is struggling, the thing that
          actually changes it is work with a qualified behaviourist, someone registered with the ABTC or the
          APBC who can see your dog and build a plan around them. We are an app for finding places, not a
          substitute for that, and we would rather say so than pretend a good pub garden fixes reactivity.
        </p>
        <p>
          What we can do is take some of the daily friction out of it, so a day out is one less thing to plan
          around, and so the places you do go are chosen rather than risked.
        </p>
      </Section>

      <div className="mt-14 relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <StoryBand
          label="Who built this"
          paragraphs={[
            <p>I am Josh. I built BarkFind from Weston-super-Mare around Mylo, a Vizsla who is particular about where he will settle, and who taught me to read a room before the dog has to.</p>,
            <p>There is no team and no office. The app is thin in some areas and honest about it, and it gets better every time an owner adds a place that worked for a dog like theirs.</p>,
          ]}
          photos={[
            { alt: "Josh with both dogs on the beach", src: "/media/creator-josh.jpg", placeholderLabel: "Photo of Josh with both dogs" },
            { alt: "Mylo the Vizsla out on the beach", src: "/media/creator-mylo.jpg", placeholderLabel: "Photo of Mylo out and about" },
          ]}
        />
      </div>

      <Section title="Questions reactive-dog owners ask">
        <div className="flex flex-col gap-6 mt-2">
          {FAQ.map((item) => (
            <div key={item.q}>
              <h3 className="font-bold text-[#1a1a1a] mb-1">{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </Section>

      <section className="mt-14 -mb-14 bg-[#FAEFD1] relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <div className="max-w-3xl mx-auto px-6 py-14 text-[#444] leading-relaxed">
          <p className="text-sm font-bold uppercase tracking-widest text-[#B74217] mb-2">Try it</p>
          <h2 className="font-serif text-2xl md:text-3xl text-[#1a1a1a] mb-4">Find somewhere your dog can actually settle</h2>
          <p className="mb-6">
            Free to browse the map and read any place's policy. Premium adds search built around your dog.
            {ANDROID_LIVE ? " iPhone and Android, UK only." : " iPhone, UK only."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={APP_STORE_URL}
              className="inline-flex items-center px-6 py-3 rounded-full bg-[#B74217] text-white text-sm font-bold hover:bg-[#333333] transition-colors shadow-sm shadow-[#B74217]/30"
            >
              Get BarkFind
            </a>
            {ANDROID_LIVE && (
              <GooglePlayButton className="inline-flex items-center px-6 py-3 rounded-full bg-[#1a1a1a] text-white text-sm font-bold hover:bg-[#333333] transition-colors shadow-sm" />
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
