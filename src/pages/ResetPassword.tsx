// Password reset landing page, rendered at /reset-password.
//
// Supabase sends recovery links here (see api/_lib/hq-reset.ts REDIRECT and the
// app's "Forgot password?" flow). The recovery token arrives in the URL: a
// fragment (#access_token=...&type=recovery) for the implicit flow, or a
// ?code= / ?token_hash= query for the newer flows. We pick that session up with
// a browser Supabase client, let the person set a new password, then scrub the
// token out of the address bar. The page is client-only and noindex.

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import PageShell from "../components/PageShell";
import { useSeo } from "../lib/seo";
import { LAUNCHED, APP_STORE_URL } from "../data/launch";

// Public publishable key, the same one committed in public/admin.html. It is
// safe in the browser bundle: it grants only anon-level access, and the recovery
// token in the URL is what authorises the password change.
const SUPABASE_URL = "https://kwwnwniyijeuorpbyvmn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-EWszMqW22vM4kNYHeq7xQ_JXMsX4MR";

// This browser exists to set one password: keep the recovery session in memory
// only, never persist or refresh it, and read the token Supabase puts in the URL.
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    detectSessionInUrl: true,
    persistSession: false,
    autoRefreshToken: false,
    flowType: "implicit",
  },
});

const MIN_LENGTH = 8;

// "checking" -> reading the link; "ready" -> show the form; "invalid" -> expired
// or already used; "done" -> password changed.
type Phase = "checking" | "ready" | "invalid" | "done";

const openHref = () => (LAUNCHED ? APP_STORE_URL : "/#download");

export default function ResetPassword() {
  useSeo({
    title: "Reset your password | BarkFind",
    description: "Set a new password for your BarkFind account.",
    path: "/reset-password",
    noindex: true,
  });

  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pick up the recovery session from the URL.
  useEffect(() => {
    let settled = false;
    const ready = () => { if (!settled) { settled = true; setPhase("ready"); } };
    const invalid = () => { if (!settled) { settled = true; setPhase("invalid"); } };

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);

    // Expired or already used links come back with an error, not a token.
    if (hash.get("error") || hash.get("error_description") || query.get("error")) {
      invalid();
      return;
    }

    // Supabase fires PASSWORD_RECOVERY once it has read the token from the hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))) {
        ready();
      }
    });

    (async () => {
      // token_hash flow: verify it ourselves.
      const tokenHash = query.get("token_hash");
      const type = query.get("type");
      if (tokenHash && (!type || type === "recovery")) {
        const { error: vErr } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        if (vErr) invalid(); else ready();
        return;
      }
      // Implicit (#access_token) flow is handled by detectSessionInUrl above.
      const { data } = await supabase.auth.getSession();
      if (data.session) ready();
    })();

    // If no session has appeared shortly after load, the link was not usable.
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) ready(); else invalid();
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // Scrub the token out of the address bar once the outcome is known, so a
  // refresh cannot replay it and it never lingers in history.
  useEffect(() => {
    if ((phase === "ready" || phase === "invalid") && (window.location.hash || window.location.search)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [phase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setSaving(true);
    const { error: upErr } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (upErr) {
      // Usually the one-hour link has run out between opening and submitting.
      setError("We could not change your password. The link may have expired. Ask for a new one from the app and try again.");
      return;
    }
    setPhase("done");
  };

  if (phase === "checking") {
    return (
      <PageShell title="Reset your password">
        <p className="text-[#444] leading-relaxed">One moment, we are checking your reset link.</p>
      </PageShell>
    );
  }

  if (phase === "invalid") {
    return (
      <PageShell title="This link has expired">
        <p className="text-[#444] leading-relaxed">
          Password reset links work once, and only for a short time. This one has already been used or has run out.
        </p>
        <p className="text-[#444] leading-relaxed mt-3">
          Open BarkFind, tap "Forgot password?" on the sign in screen, and we will send you a fresh link.
        </p>
      </PageShell>
    );
  }

  if (phase === "done") {
    return (
      <PageShell title="Password changed">
        <p className="text-[#444] leading-relaxed">
          Your password has been changed. Open BarkFind and sign in with your new password.
        </p>
        <a
          href={openHref()}
          className="inline-flex items-center mt-5 px-6 py-3 rounded-full bg-[#B74217] text-white font-bold hover:opacity-90 transition-opacity shadow-sm shadow-[#B74217]/30"
        >
          Open BarkFind
        </a>
      </PageShell>
    );
  }

  // phase === "ready"
  return (
    <PageShell title="Choose a new password">
      <p className="text-[#444] leading-relaxed">
        Pick a new password for your BarkFind account. At least {MIN_LENGTH} characters, and enter it twice so we know it is right.
      </p>
      <form onSubmit={submit} className="mt-6 max-w-sm flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[#2F291E]">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-5 py-3.5 rounded-2xl bg-white border border-stone-200 text-[#2F291E] text-sm outline-none focus:ring-2 focus:ring-[#B74217]/30"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[#2F291E]">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="px-5 py-3.5 rounded-2xl bg-white border border-stone-200 text-[#2F291E] text-sm outline-none focus:ring-2 focus:ring-[#B74217]/30"
          />
        </label>
        {error && (
          <p className="text-sm font-semibold text-[#B74217]" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-1 inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#B74217] text-white font-bold hover:opacity-90 transition-opacity shadow-sm shadow-[#B74217]/30 disabled:opacity-60"
        >
          {saving ? "Saving" : "Change password"}
        </button>
      </form>
    </PageShell>
  );
}
