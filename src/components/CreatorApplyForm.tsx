import { useState } from "react";
import { applyAsCreator } from "../lib/creatorsDb";
import { CREATOR_TERMS_VERSION } from "../data/creatorTerms";

// "Join the programme" on /creators. Everything is checked by creator_apply in
// the database; the form shows its error text as it comes back, so the rules
// live in one place. The terms version sent is the same constant shown under
// the terms (see creatorTerms.ts).
const PLATFORMS = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["other", "Somewhere else"],
] as const;

const input =
  "w-full px-4 py-3 rounded-xl bg-white border border-[#B74217]/15 text-[#2F291E] text-sm outline-none focus:ring-2 focus:ring-[#B74217]/30";
const label = "block text-sm font-semibold text-[#1a1a1a] mb-1.5";
const hint = "mt-1.5 text-xs text-[#585858] leading-relaxed";

export default function CreatorApplyForm() {
  const [f, setF] = useState({
    displayName: "",
    primaryHandle: "",
    instagram: "",
    tiktok: "",
    facebook: "",
    followers: "",
    platform: "instagram",
    accountEmail: "",
    contactEmail: "",
    signature: "",
    agreed: false,
  });
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const handles: Record<string, string> = {};
    for (const k of ["instagram", "tiktok", "facebook"] as const) if (f[k].trim()) handles[k] = f[k].trim();
    const digits = f.followers.replace(/[^\d]/g, "");
    try {
      const r = await applyAsCreator({
        displayName: f.displayName,
        primaryHandle: f.primaryHandle,
        handles,
        followers: digits ? Number(digits) : null,
        platform: f.platform,
        accountEmail: f.accountEmail,
        contactEmail: f.contactEmail,
        termsVersion: CREATOR_TERMS_VERSION,
        agreed: f.agreed,
        signature: f.signature,
      });
      if (r.ok) {
        setStatus("done");
        return;
      }
      setError(r.error);
    } catch {
      setError("That did not send. Check your connection and try again.");
    }
    setStatus("idle");
  };

  if (status === "done") {
    return (
      <div className="rounded-2xl bg-white border border-[#B74217]/15 p-6">
        <p className="text-[#1a1a1a]">Thanks. I'll look at your application and email you within a few days.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <label htmlFor="ca-name" className={label}>Name you want to be credited as</label>
        <input id="ca-name" className={input} value={f.displayName} onChange={set("displayName")} maxLength={40} autoComplete="nickname" />
      </div>
      <div>
        <label htmlFor="ca-handle" className={label}>Main handle</label>
        <input id="ca-handle" className={input} value={f.primaryHandle} onChange={set("primaryHandle")} maxLength={41} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(["instagram", "tiktok", "facebook"] as const).map((k) => (
          <div key={k}>
            <label htmlFor={`ca-${k}`} className={label}>
              {k === "instagram" ? "Instagram" : k === "tiktok" ? "TikTok" : "Facebook"} <span className="font-normal text-[#585858]">(optional)</span>
            </label>
            <input id={`ca-${k}`} className={input} value={f[k]} onChange={set(k)} maxLength={61} autoCapitalize="none" autoCorrect="off" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ca-followers" className={label}>Your largest following</label>
          <input id="ca-followers" className={input} value={f.followers} onChange={set("followers")} inputMode="numeric" placeholder="For example 12500" />
        </div>
        <div>
          <label htmlFor="ca-platform" className={label}>Which platform it's on</label>
          <select id="ca-platform" className={input} value={f.platform} onChange={set("platform")}>
            {PLATFORMS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="ca-account" className={label}>The email on your BarkFind account</label>
        <input id="ca-account" type="email" className={input} value={f.accountEmail} onChange={set("accountEmail")} autoComplete="email" autoCapitalize="none" />
        <p className={hint}>
          The one you sign in to BarkFind with. If you use Sign in with Apple, it may be an Apple relay address. You can find it in the app under Profile.
        </p>
      </div>
      <div>
        <label htmlFor="ca-contact" className={label}>
          Best email to reach you <span className="font-normal text-[#585858]">(optional)</span>
        </label>
        <input id="ca-contact" type="email" className={input} value={f.contactEmail} onChange={set("contactEmail")} autoCapitalize="none" />
      </div>
      <label className="flex items-start gap-3 text-sm text-[#1a1a1a]">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B74217]" checked={f.agreed} onChange={set("agreed")} />
        <span>I've read and agree to the terms above</span>
      </label>
      <div>
        <label htmlFor="ca-sign" className={label}>Type your full name to sign</label>
        <input id="ca-sign" className={input} value={f.signature} onChange={set("signature")} maxLength={80} autoComplete="name" />
        <p className={hint}>This is your signature on the terms above. I'll email you a signed copy of the agreement when your code is ready.</p>
      </div>
      <div>
        <button
          type="submit"
          disabled={status === "sending"}
          className="px-7 py-3.5 rounded-full bg-[#B74217] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {status === "sending" ? "Sending" : "Sign and send application"}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-[#B74217]">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
