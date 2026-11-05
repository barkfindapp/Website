// /business/claim - a venue owner claims their BarkFind listing.
//
// Client-only and noindex. The owner signs in (or creates an ordinary account),
// finds their venue in BarkFind's own places, and sends a claim. Everything goes
// through /api/business; this page holds no database access of its own. A claim
// is always tied to a venue, so one never arrives without a location.
import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import { useSeo } from "../lib/seo";
import { supabase, callBusiness, type Session } from "../lib/businessClient";

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-[#1a1a1a] outline-none focus:border-[#B74217] focus:ring-2 focus:ring-[#B74217]/15 bg-white";
const labelClass = "block text-sm font-semibold text-[#1a1a1a] mb-1.5";
const primaryBtn =
  "px-6 py-3.5 rounded-full bg-[#B74217] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 shadow-sm shadow-[#B74217]/20";

type Venue = { id: string; name: string; address: string; website: string | null };

export default function BusinessClaim() {
  useSeo({
    title: "Claim your venue | BarkFind for businesses",
    description: "Claim your venue on BarkFind so you can keep its listing accurate.",
    path: "/business/claim",
    noindex: true,
  });

  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <PageShell title="Claim your venue">
        <p className="text-[#444] leading-relaxed">One moment.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Claim your venue"
      subtitle="Take ownership of your listing so you can keep its details and dog-friendly amenities accurate."
    >
      {session ? <ClaimFlow session={session} /> : <AuthPanel />}
    </PageShell>
  );
}

// --- sign in or create an account -------------------------------------------

function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/business/claim" },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your email to confirm your address, then come back and sign in.");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err: unknown) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const magicLink = async () => {
    setError(null);
    setNotice(null);
    if (!email) {
      setError("Enter your email first, then ask for a link.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + "/business/claim" },
      });
      if (err) throw err;
      setNotice("Check your email for a link to sign in.");
    } catch (err: unknown) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 max-w-md">
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => { setMode("signin"); setError(null); setNotice(null); }}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${mode === "signin" ? "bg-[#B74217] text-white" : "bg-[#FAEFD1] text-[#2F291E]"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode("signup"); setError(null); setNotice(null); }}
          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${mode === "signup" ? "bg-[#B74217] text-white" : "bg-[#FAEFD1] text-[#2F291E]"}`}
        >
          Create an account
        </button>
      </div>

      <p className="text-sm text-[#585858] mb-4 leading-relaxed">
        {mode === "signin"
          ? "Sign in with your BarkFind account. If you use the app, it is the same account."
          : "Create an account to claim and manage your venue. If you already use the BarkFind app, sign in instead."}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Email</label>
          <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@business.com" />
        </div>
        <div>
          <label className={labelClass}>Password</label>
          <input required type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
        </div>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Please wait" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="mt-4">
        <button type="button" onClick={magicLink} disabled={busy} className="text-sm font-semibold text-[#B74217] hover:underline disabled:opacity-60">
          Email me a link to sign in instead
        </button>
      </div>

      {notice && <p className="mt-4 text-sm text-[#2F291E] bg-[#F2F8F8] border-l-[3px] border-[#4FA4A1] rounded-lg px-4 py-3">{notice}</p>}
      {error && <p className="mt-4 text-sm font-semibold text-[#B74217]" role="alert">{error}</p>}
    </div>
  );
}

// --- find a venue and send the claim ----------------------------------------

function ClaimFlow({ session }: { session: Session }) {
  const accountEmail = session.user.email || "";
  const [venue, setVenue] = useState<Venue | null>(null);
  const [done, setDone] = useState<{ email: string; emailed: boolean; hasOwner: boolean } | null>(null);

  const signOut = () => supabase.auth.signOut();

  if (done) {
    return (
      <div className="mt-2 max-w-xl">
        <div className="rounded-2xl bg-[#FAEFD1] border border-[#B74217]/15 p-8">
          <p className="font-serif text-2xl text-[#1a1a1a] mb-2">Your claim is in.</p>
          <p className="text-sm text-[#585858] leading-relaxed">
            I review every claim by hand to check you run the venue. I will email you at{" "}
            <span className="font-semibold text-[#2F291E]">{done.email}</span> once it is done.
          </p>
          {done.hasOwner && (
            <p className="text-sm text-[#585858] leading-relaxed mt-3">
              This venue already has an owner on BarkFind, so I will check your claim with them first.
            </p>
          )}
          {!done.emailed && (
            <p className="text-sm text-[#585858] leading-relaxed mt-3">
              The confirmation email did not send, but your claim is saved. You do not need to do anything.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-xl">
      <p className="text-xs text-[#585858] mb-5">
        Signed in as {accountEmail}.{" "}
        <button type="button" onClick={signOut} className="font-semibold text-[#B74217] hover:underline">Sign out</button>
      </p>

      {venue ? (
        <ClaimForm
          venue={venue}
          accountEmail={accountEmail}
          onBack={() => setVenue(null)}
          onDone={(email, emailed, hasOwner) => setDone({ email, emailed, hasOwner })}
        />
      ) : (
        <VenueSearch onPick={setVenue} />
      )}
    </div>
  );
}

function VenueSearch({ onPick }: { onPick: (v: Venue) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Venue[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (q.trim().length < 2) {
      setError("Type the venue name and town, for example Barking Dog Taunton.");
      return;
    }
    setBusy(true);
    const r = await callBusiness<{ venues: Venue[] }>("search_venues", { q: q.trim() });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setResults(r.data.venues);
  };

  return (
    <div>
      <h3 className="font-bold text-[#1a1a1a] text-base mb-1">Find your venue</h3>
      <p className="text-sm text-[#585858] mb-4 leading-relaxed">Search BarkFind for your venue by name and town.</p>
      <form onSubmit={search} className="flex flex-col sm:flex-row gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} placeholder="Venue name and town" />
        <button type="submit" disabled={busy} className={primaryBtn + " whitespace-nowrap"}>{busy ? "Searching" : "Search"}</button>
      </form>
      {error && <p className="mt-4 text-sm font-semibold text-[#B74217]" role="alert">{error}</p>}

      {results && (
        <div className="mt-6">
          {results.length === 0 ? (
            <div className="rounded-2xl bg-white border border-stone-100 p-6">
              <p className="text-sm text-[#2F291E] font-semibold mb-1">Can't find your venue?</p>
              <p className="text-sm text-[#585858] leading-relaxed">
                Check the spelling and the town, or try just the name. Still nothing? Email{" "}
                <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>{" "}
                with its name and address and we'll add it, then you can claim it.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5 list-none">
              {results.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onPick(v)}
                    className="w-full text-left rounded-xl bg-white border border-stone-200 hover:border-[#B74217] p-4 transition-colors"
                  >
                    <span className="block font-bold text-[#1a1a1a] text-sm">{v.name}</span>
                    {v.address && <span className="block text-xs text-[#585858] mt-0.5">{v.address}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ClaimForm({ venue, accountEmail, onBack, onDone }: {
  venue: Venue;
  accountEmail: string;
  onBack: () => void;
  onDone: (email: string, emailed: boolean, hasOwner: boolean) => void;
}) {
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [workEmail, setWorkEmail] = useState(accountEmail);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await callBusiness<{ ok: boolean; emailed: boolean; has_owner: boolean }>("submit_claim", {
      location_id: venue.id,
      role: role.trim(),
      phone: phone.trim(),
      work_email: workEmail.trim(),
      evidence_url: evidenceUrl.trim() || undefined,
      message: message.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(workEmail.trim(), r.data.emailed, r.data.has_owner);
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[#B74217] hover:underline mb-4">&larr; Choose a different venue</button>
      <div className="rounded-xl bg-[#FAEFD1] border border-[#B74217]/15 p-4 mb-5">
        <p className="font-bold text-[#1a1a1a] text-sm">{venue.name}</p>
        {venue.address && <p className="text-xs text-[#585858] mt-0.5">{venue.address}</p>}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>Your role at the venue *</label>
          <input required value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} placeholder="Owner, manager, and so on" />
        </div>
        <div>
          <label className={labelClass}>Phone *</label>
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="A number I can reach you on" />
        </div>
        <div>
          <label className={labelClass}>Work email *</label>
          <input required type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} className={inputClass} placeholder="you@yourvenue.com" />
          <p className="text-xs text-[#585858] mt-1.5">An email on the venue's own domain helps me confirm your claim faster.</p>
        </div>
        <div>
          <label className={labelClass}>Evidence link</label>
          <input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} className={inputClass} placeholder="A link that shows you run the venue (optional)" />
        </div>
        <div>
          <label className={labelClass}>Anything else</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={inputClass} placeholder="Optional" />
        </div>
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Sending" : "Send claim"}</button>
        {error && <p className="text-sm font-semibold text-[#B74217]" role="alert">{error}</p>}
      </form>
    </div>
  );
}

// Supabase auth errors carry a human message; fall back to a plain line.
function messageFor(err: unknown): string {
  const m = (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message) : "";
  if (/invalid login credentials/i.test(m)) return "That email and password did not match. Try again, or use the link option.";
  if (/already registered|already been registered/i.test(m)) return "That email already has an account. Sign in instead.";
  if (/rate limit|too many/i.test(m)) return "Too many tries in a short time. Wait a minute and try again.";
  return m || "That did not work. Try again.";
}
