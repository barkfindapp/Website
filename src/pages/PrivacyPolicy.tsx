// BarkFind Privacy Policy, rendered at /privacy
// Source: company-supplied draft.
// NOTE: "Last updated" is a placeholder. Set it to the actual go-live date (the day
// the guest-browsing app build ships) before publishing. Do not deploy before then.

import PageShell, { Section } from "../components/PageShell";

export default function PrivacyPolicy() {
  return (
    <PageShell title="Privacy Policy" meta="Last updated: pending go-live date">
        <p className="text-[#444] leading-relaxed">
          BarkFind ("BarkFind", "we", "us", "our") is operated by <strong>BARKFIND LIMITED</strong> (company
          no. GB17093288), registered at 80A Walliscote Road, Weston-Super-Mare, North Somerset, United
          Kingdom, BS23 1ED. We are the controller of your personal data under UK data protection law
          (UK GDPR and the Data Protection Act 2018).
        </p>
        <p className="text-[#444] leading-relaxed mt-4">
          This policy explains what data we collect through the BarkFind mobile app, why we collect it, who we
          share it with, and the rights you have. If you have any questions, contact us at{" "}
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
        </p>

        <Section title="Who this applies to">
          <p>
            BarkFind is intended for dog owners aged 18 and over in the United Kingdom. The app is not directed
            at children, and we do not knowingly collect data from anyone under 16.
          </p>
        </Section>

        <Section title="What we collect">
          <p>We only collect what we need to run BarkFind. Specifically:</p>
          <p>
            You can use BarkFind without an account. When you open the app without signing in, we create an anonymous
            session so the map, search and place pages work straight away. It is a random identifier, not your name or
            email. It is held on your device and against a record on our servers. Your searches and basic usage are
            recorded against it; nothing that needs an account, such as reviews, saved places or a dog profile, is
            created for a guest. If you sign in or create an account later, the guest session ends and your activity
            from then on is held against your account.
          </p>
          <ul className="flex flex-col gap-3 list-none">
            {[
              ["Account information", "your name and email address when you create an account or contact support. Authentication is handled through our backend provider; if you sign in with Apple or Google, we receive the basic identifiers you authorise."],
              ["Location", "with your permission, your device's precise location, used to show dog-friendly places near you and to power distance-based search. Location is optional: the map still works without it, and you can find any town using search. You can turn location access off at any time in your device settings."],
              ["Content you create", "reviews, ratings, photos you upload, your dog's profile (name, breed, size, temperament and similar details), saved favourites, and messages you send us through support."],
              ["Search activity", "the searches you run in the app, including questions you ask our AI assistant “Mylo”, so we can return results and improve the feature. When you are not signed in, these are recorded against your anonymous identifier rather than an account."],
              ["Usage data", "how you interact with the app (for example sessions, screens viewed and search counts) and basic device information, used for analytics and to keep the app working reliably. When you are not signed in, this is recorded against your anonymous identifier rather than an account."],
              ["Purchase information", "your subscription status and history. Payment itself is processed by Apple; we never see or store your card details."],
            ].map(([term, def]) => (
              <li key={term} className="pl-4 border-l-2 border-[#FAEFD1]">
                <strong className="text-[#1a1a1a]">{term}</strong>, {def}
              </li>
            ))}
          </ul>
          <p>
            We do <strong>not</strong> collect special category (sensitive) data, and we do <strong>not</strong> use
            any third-party advertising or cross-app tracking. BarkFind does not track you across other companies'
            apps or websites.
          </p>
        </Section>

        <Section title="How we use your data">
          <p>
            We use your data to: create and manage your account; show you nearby dog-friendly places and
            personalised recommendations; operate the Mylo AI assistant; publish and moderate community reviews;
            manage subscriptions and the free trial; provide customer support; keep the app secure and prevent
            abuse; and understand and improve how BarkFind is used.
          </p>
        </Section>

        <Section title="Legal bases (UK GDPR)">
          <p>
            We rely on: <strong>performance of a contract</strong> (to provide the app and your subscription);
            <strong> consent</strong> (for precise location access, which you can withdraw at any time); and our
            <strong> legitimate interests</strong> (to create and operate an anonymous session so the app works for
            you before you sign up, and to secure, maintain, analyse and improve the service, and to moderate
            community content), balanced against your rights.
          </p>
        </Section>

        <Section title="Who we share it with">
          <p>
            We use trusted service providers ("processors") who handle data on our behalf under contract, only as
            needed to run BarkFind:
          </p>
          <ul className="flex flex-col gap-3 list-none">
            {[
              ["Supabase", "backend database, authentication and file storage."],
              ["RevenueCat and Apple", "subscription management and payment processing."],
              ["Anthropic", "powers the Mylo AI assistant; your search query (and limited dog-profile context) is processed to generate results. It is not used to train third-party models for advertising."],
              ["Google Maps Platform", "map display and place data."],
            ].map(([term, def]) => (
              <li key={term} className="pl-4 border-l-2 border-[#FAEFD1]">
                <strong className="text-[#1a1a1a]">{term}</strong>, {def}
              </li>
            ))}
          </ul>
          <p>
            Some of these providers process data outside the UK (including in the United States). Where they do, we
            rely on appropriate safeguards such as the UK International Data Transfer Agreement / Addendum or
            equivalent mechanisms.
          </p>
          <p>
            We do not sell your personal data. We may disclose data if required by law, or to protect our rights,
            users, or the public.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your account data for as long as your account is active. If you delete your account, we delete
            or anonymise your personal data within a reasonable period, except where we must retain limited records
            to meet legal, tax or fraud-prevention obligations. Community reviews may be retained in anonymised
            form.
          </p>
          <p>
            If you have not signed in, we delete the anonymous session and its usage records after 30 days of
            inactivity, and any use of the app resets that period. Searches made during that session are kept without
            any identifier attached, so they can no longer be linked to you or your device. Opening the app again
            later simply starts a new anonymous session.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under UK GDPR you have the right to access, correct, delete, restrict or object to our processing of
            your data, to data portability, and to withdraw consent. If you have an account, the app provides
            in-built tools to <strong>export</strong> and <strong>delete</strong> your data, and you can also email
            us at{" "}
            <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
            If you have not signed in, deleting the app ends your anonymous session, the anonymous record is removed
            by the 30-day inactivity deletion described above, and you can email{" "}
            <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>{" "}
            to have it removed sooner. You have the right to complain to the Information Commissioner's Office (ICO)
            at{" "}
            <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-[#B74217] font-semibold hover:underline">ico.org.uk</a>.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We protect your data with industry-standard measures including encryption in transit, access controls
            and row-level security on our database. No system is perfectly secure, but we work to keep your
            information safe.
          </p>
        </Section>

        <Section title="Children">
          <p>
            BarkFind is not intended for children under 16. If you believe a child has provided us with personal
            data, contact us and we will delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. We will post the new version here and update the "Last
            updated" date; significant changes will be communicated in the app.
          </p>
        </Section>

        <Section title="Contact">
          <div className="rounded-2xl bg-[#FAEFD1] p-6 not-prose">
            <p className="font-bold text-[#1a1a1a] mb-1">BARKFIND LIMITED</p>
            <p className="text-sm text-[#585858]">80A Walliscote Road, Weston-Super-Mare, North Somerset, United Kingdom, BS23 1ED</p>
            <p className="text-sm text-[#585858] mt-2">
              Email:{" "}
              <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>
            </p>
            <p className="text-sm text-[#585858] mt-1">ICO registration: ZC184707</p>
          </div>
        </Section>
    </PageShell>
  );
}
