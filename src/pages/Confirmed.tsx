// Landing page for Supabase email confirmation, rendered at /confirmed.
// Supabase puts the result in the URL fragment (client-only, never sent to the
// server), so we read window.location.hash. A fragment carrying error or
// error_description means the link failed; anything else is treated as success.

import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";

function readOutcome(): "success" | "error" {
  if (typeof window === "undefined") return "success";
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (params.get("error") || params.get("error_description")) return "error";
  return "success";
}

export default function Confirmed() {
  // Read once, synchronously, so the correct state renders on first paint.
  const [outcome] = useState(readOutcome);

  // Clear the fragment after reading, so a refresh does not re-show a stale state.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  if (outcome === "error") {
    return (
      <PageShell title="That link has expired">
        <p className="text-[#444] leading-relaxed">
          Confirmation links are single use and time limited. Open BarkFind, try signing in, and ask for a new one.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Email confirmed">
      <p className="text-[#444] leading-relaxed">
        That's your address verified. Head back to BarkFind and pick up where you left off.
      </p>
      <p className="text-sm text-[#585858] mt-2">You can close this tab.</p>
    </PageShell>
  );
}
