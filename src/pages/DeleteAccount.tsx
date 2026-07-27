import PageShell, { Section, Bullets } from "../components/PageShell";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-[#B74217] text-white font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <div>
        <p className="font-bold text-[#1a1a1a]">{title}</p>
        <div className="text-sm text-[#585858] leading-relaxed mt-1">{children}</div>
      </div>
    </div>
  );
}

export default function DeleteAccount() {
  return (
    <PageShell
      title="Delete your account & data"
      subtitle="You're in control of your data. Here's how to delete your BarkFind account and the personal information associated with it."
    >
      <Section title="Delete your account in the app">
        <p>The fastest way to delete your account and data is directly in the BarkFind app:</p>
        <div className="flex flex-col gap-5 mt-2">
          <Step n={1} title="Open Settings">Open BarkFind and go to the <strong>Profile</strong> tab, then <strong>Settings</strong>.</Step>
          <Step n={2} title="Choose Delete Account">Scroll to the account section and tap <strong>Delete Account</strong>.</Step>
          <Step n={3} title="Confirm">Confirm the deletion. Your account and associated personal data will be removed.</Step>
        </div>
      </Section>

      <Section title="Prefer us to do it?">
        <p>
          If you can't access the app, email{" "}
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>{" "}
          from the email address on your account with the subject <strong>"Delete my account"</strong>. We may ask a
          question to verify it's you, then process the deletion.
        </p>
      </Section>

      <Section title="What gets deleted">
        <Bullets
          items={[
            "Your account and profile (name, email, avatar).",
            "Your dog profiles.",
            "Your saved favourites and preferences.",
            "Photos you have uploaded.",
            "Your search history, including questions asked to Mylo.",
          ]}
        />
      </Section>

      <Section title="What we may retain">
        <p>
          We delete or anonymise your personal data within a reasonable period. We may retain limited records where
          required for legal, tax or fraud-prevention purposes, and community reviews may be kept in an anonymised
          form so listings remain useful to other dog owners. Full detail is in our{" "}
          <a href="/privacy" className="text-[#B74217] font-semibold hover:underline">Privacy Policy</a>.
        </p>
      </Section>

      <Section title="Export your data">
        <p>
          You can also request a copy of your data before deleting. Use the in-app <strong>export</strong> tool in
          Settings, or email us at{" "}
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
        </p>
      </Section>

      <Section title="A note on subscriptions">
        <p>
          Deleting your account does <strong>not</strong> cancel an active subscription, because billing is managed by
          Apple. Cancel separately via <strong>iPhone Settings → your name → Subscriptions → BarkFind</strong> to stop
          future charges.
        </p>
      </Section>
    </PageShell>
  );
}
