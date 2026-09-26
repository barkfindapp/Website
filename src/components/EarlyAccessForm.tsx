import { useState } from "react";

// Shared early-access email capture. Writes to the unified waitlist (Supabase
// public.early_access) via /api/early-access, tagged by platform.
// Extracted from LandingPage.tsx with no behaviour change; styled for a dark
// background (white success/error text).
export default function EarlyAccessForm({
  platform,
  buttonLabel = "Get early access",
  compact = false,
}: {
  platform: "ios" | "android";
  buttonLabel?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "duplicate" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), platform }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(data.duplicate ? "duplicate" : "success");
      } else {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success" || status === "duplicate") {
    return (
      <div className={`bg-white/15 backdrop-blur-sm rounded-2xl p-5 text-white border border-white/20 ${compact ? "" : "max-w-md mx-auto"}`}>
        <p className="font-bold mb-1">
          {status === "duplicate" ? "You're already on the list, nice one." : "You're on the list! 🐾"}
        </p>
        <p className="text-white/80 text-sm leading-relaxed">
          We'll email you the moment BarkFind launches, with your founding-member offer. Founding pricing is limited to 100 members, so keep an eye on your inbox.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "max-w-md mx-auto"}>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="flex-1 px-5 py-3.5 rounded-full text-[#2F291E] text-sm font-medium outline-none focus:ring-2 focus:ring-white/40 bg-white shadow-sm"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-7 py-3.5 rounded-full bg-[#2F291E] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap shadow-sm"
        >
          {status === "loading" ? "…" : buttonLabel}
        </button>
      </form>
      {status === "error" && <p className="mt-3 text-white/70 text-xs">{errorMsg}</p>}
    </div>
  );
}
