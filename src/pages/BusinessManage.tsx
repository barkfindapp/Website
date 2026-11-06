// /business/manage - a venue owner edits their listing.
//
// Client-only and noindex. The owner signs in (same account as the claim flow),
// picks a venue they manage, and edits it. Every save becomes one change request
// that waits for HQ approval; nothing on the venue changes until then. Photos are
// resized in the browser and uploaded straight to the private business-uploads
// bucket with a short-lived signed URL from /api/business.
import { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import { useSeo } from "../lib/seo";
import { supabase, callBusiness, type Session } from "../lib/businessClient";

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-[#1a1a1a] outline-none focus:border-[#B74217] focus:ring-2 focus:ring-[#B74217]/15 bg-white";
const labelClass = "block text-sm font-semibold text-[#1a1a1a] mb-1.5";
const primaryBtn =
  "px-6 py-3.5 rounded-full bg-[#B74217] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 shadow-sm shadow-[#B74217]/20";

const UPLOAD_BUCKET = "business-uploads";
const MAX_PHOTOS = 6;
const MAX_DIM = 1600;
const DOG_POLICIES: [string, string][] = [["welcome", "Dogs welcome"], ["restricted", "Restricted"], ["not_allowed", "Not allowed"]];

type Venue = { id: string; name: string; address: string; role: string; barkfind_verified: boolean; pending_change: { id: string; created_at: string } | null };
type AmenityItem = { code: string; label: string; tooltip: string };
type AmenityGroup = { title: string; items: AmenityItem[] };
type EditVenue = {
  id: string; name: string; address: string; category: string; description: string | null;
  website: string | null; opening_hours: unknown; amenities: string[] | null;
  dog_policy: string | null; dog_policy_note: string | null; image_url: string | null;
};
type Pending = { id: string; changes: Record<string, unknown>; current_values: Record<string, unknown>; photo_paths: string[] | null; created_at: string };

export default function BusinessManage() {
  useSeo({
    title: "Manage your venue | BarkFind for businesses",
    description: "Keep your BarkFind listing accurate: details, hours, amenities and photos.",
    path: "/business/manage",
    noindex: true,
  });

  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [venueId, setVenueId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) return <PageShell title="Manage your venue"><p className="text-[#444]">One moment.</p></PageShell>;

  if (!session) {
    return (
      <PageShell title="Manage your venue" subtitle="Sign in to manage a venue you own on BarkFind.">
        <p className="text-[#444] leading-relaxed mt-2">
          You need to sign in first. If you have not claimed your venue yet, start at{" "}
          <a href="/business/claim" className="text-[#B74217] font-semibold hover:underline">barkfind.com/business/claim</a>.
        </p>
        <a href="/business/claim" className={"inline-flex mt-5 " + primaryBtn}>Go to sign in</a>
      </PageShell>
    );
  }

  return (
    <PageShell title="Manage your venue" subtitle="Keep your listing accurate. Every change is checked before it goes live.">
      <p className="text-xs text-[#585858] mt-2 mb-5">
        Signed in as {session.user.email}.{" "}
        <button type="button" onClick={() => supabase.auth.signOut()} className="font-semibold text-[#B74217] hover:underline">Sign out</button>
      </p>
      {venueId
        ? <VenueEditor venueId={venueId} onBack={() => setVenueId(null)} />
        : <VenueList onPick={setVenueId} />}
    </PageShell>
  );
}

function VenueList({ onPick }: { onPick: (id: string) => void }) {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callBusiness<{ venues: Venue[] }>("my_venues").then((r) => {
      if (r.ok) setVenues(r.data.venues); else setError(r.error);
    });
  }, []);

  if (error) return <p className="text-sm font-semibold text-[#B74217]">{error}</p>;
  if (!venues) return <p className="text-sm text-[#585858]">Loading your venues.</p>;
  if (!venues.length) {
    return (
      <div className="rounded-2xl bg-white border border-stone-100 p-6">
        <p className="text-sm text-[#2F291E] font-semibold mb-1">You do not manage any venues yet.</p>
        <p className="text-sm text-[#585858] leading-relaxed">
          Once a claim is approved, your venue appears here. Claim one at{" "}
          <a href="/business/claim" className="text-[#B74217] font-semibold hover:underline">barkfind.com/business/claim</a>.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5 list-none">
      {venues.map((v) => (
        <li key={v.id}>
          <button type="button" onClick={() => onPick(v.id)} className="w-full text-left rounded-xl bg-white border border-stone-200 hover:border-[#B74217] p-4 transition-colors">
            <span className="block font-bold text-[#1a1a1a] text-sm">{v.name}</span>
            {v.address && <span className="block text-xs text-[#585858] mt-0.5">{v.address}</span>}
            {v.pending_change && <span className="inline-block mt-1.5 text-xs font-semibold text-[#B74217] bg-[#FAEFD1] rounded-full px-2.5 py-0.5">Change waiting for approval</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Downscale an image file to a JPEG blob no larger than MAX_DIM on its long edge.
async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the image."))), "image/jpeg", 0.82));
}

function VenueEditor({ venueId, onBack }: { venueId: string; onBack: () => void }) {
  const [venue, setVenue] = useState<EditVenue | null>(null);
  const [options, setOptions] = useState<AmenityGroup[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // form state
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [hours, setHours] = useState("");
  const [amenities, setAmenities] = useState<Set<string>>(new Set());
  const [dogPolicy, setDogPolicy] = useState("");
  const [dogNote, setDogNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setLoadErr(null);
    callBusiness<{ venue: EditVenue; amenity_options: AmenityGroup[]; pending: Pending | null }>("venue_for_edit", { location_id: venueId }).then((r) => {
      if (!r.ok) { setLoadErr(r.error); return; }
      const v = r.data.venue;
      setVenue(v); setOptions(r.data.amenity_options || []); setPending(r.data.pending);
      setDescription(v.description || "");
      setWebsite(v.website || "");
      setHours(Array.isArray(v.opening_hours) ? (v.opening_hours as string[]).join("\n") : "");
      setAmenities(new Set(v.amenities || []));
      setDogPolicy(v.dog_policy || "");
      setDogNote(v.dog_policy_note || "");
      setPhotos([]);
    });
  }, [venueId]);
  useEffect(load, [load]);

  const toggleAmenity = (code: string) => setAmenities((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });

  const addPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setMsg(null);
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).slice(0, room);
    setUploading(true);
    try {
      for (const file of chosen) {
        if (!/^image\/(jpeg|png)$/.test(file.type)) { setMsg({ ok: false, text: "Photos must be JPEG or PNG." }); continue; }
        const ext = file.type === "image/png" ? "png" : "jpg";
        const r = await callBusiness<{ path: string; token: string }>("photo_upload_url", { location_id: venueId, ext });
        if (!r.ok) { setMsg({ ok: false, text: r.error }); continue; }
        const blob = await resizeToJpeg(file);
        const { error } = await supabase.storage.from(UPLOAD_BUCKET).uploadToSignedUrl(r.data.path, r.data.token, blob, { contentType: "image/jpeg" });
        if (error) { setMsg({ ok: false, text: "That photo did not upload. Try again." }); continue; }
        setPhotos((p) => [...p, r.data.path]);
      }
    } finally { setUploading(false); }
  };

  const save = async () => {
    setMsg(null); setSaving(true);
    const changes: Record<string, unknown> = {
      description,
      website,
      opening_hours: hours.split("\n").map((l) => l.trim()).filter(Boolean),
      amenities: Array.from(amenities),
      dog_policy: dogPolicy || "",
      dog_policy_note: dogNote,
    };
    const r = await callBusiness<{ ok: boolean }>("submit_change", { location_id: venueId, changes, photo_paths: photos });
    setSaving(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: "Saved. Your change is waiting for approval." });
    load();
  };

  const withdraw = async () => {
    if (!pending) return;
    const r = await callBusiness("withdraw_change", { id: pending.id });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    load();
  };

  if (loadErr) return <div><BackLink onBack={onBack} /><p className="text-sm font-semibold text-[#B74217]">{loadErr}</p></div>;
  if (!venue) return <div><BackLink onBack={onBack} /><p className="text-sm text-[#585858]">Loading.</p></div>;

  return (
    <div className="max-w-2xl">
      <BackLink onBack={onBack} />
      <div className="rounded-xl bg-[#FAEFD1] border border-[#B74217]/15 p-4 mb-5">
        <p className="font-bold text-[#1a1a1a] text-sm">{venue.name}</p>
        {venue.address && <p className="text-xs text-[#585858] mt-0.5">{venue.address}</p>}
      </div>

      {pending && <WaitingChange pending={pending} onWithdraw={withdraw} />}

      <fieldset disabled={!!pending} className={pending ? "opacity-60" : ""}>
        <div className="flex flex-col gap-5">
          <div>
            <label className={labelClass}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputClass} placeholder="Tell dog owners what makes your place good for dogs." />
          </div>
          <div>
            <label className={labelClass}>Website</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} placeholder="https://" />
          </div>
          <div>
            <label className={labelClass}>Opening hours</label>
            <textarea value={hours} onChange={(e) => setHours(e.target.value)} rows={7} className={inputClass} placeholder={"Monday 9am to 5pm\nTuesday 9am to 5pm"} />
            <p className="text-xs text-[#585858] mt-1.5">One line per day.</p>
          </div>
          <div>
            <label className={labelClass}>Dog policy</label>
            <select value={dogPolicy} onChange={(e) => setDogPolicy(e.target.value)} className={inputClass}>
              <option value="">Not set</option>
              {DOG_POLICIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input value={dogNote} onChange={(e) => setDogNote(e.target.value)} className={inputClass + " mt-2"} placeholder="Your own wording, for example dogs welcome downstairs only" />
          </div>
          {options.length > 0 && (
            <div>
              <label className={labelClass}>Dog-friendly amenities</label>
              <div className="flex flex-col gap-4 mt-1">
                {options.map((g) => (
                  <div key={g.title}>
                    <p className="text-xs font-bold text-[#2F291E] mb-1.5">{g.title}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {g.items.map((it) => (
                        <label key={it.code} className="flex items-start gap-2 text-sm text-[#444] cursor-pointer">
                          <input type="checkbox" checked={amenities.has(it.code)} onChange={() => toggleAmenity(it.code)} className="mt-0.5 accent-[#B74217]" />
                          <span>{it.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={labelClass}>Photos</label>
            <p className="text-xs text-[#585858] mb-2">Up to {MAX_PHOTOS}, JPEG or PNG. They wait for approval before they appear.</p>
            {photos.length > 0 && <p className="text-sm text-[#2F291E] mb-2">{photos.length} photo{photos.length > 1 ? "s" : ""} ready to submit.</p>}
            {photos.length < MAX_PHOTOS && (
              <input type="file" accept="image/jpeg,image/png" multiple onChange={(e) => addPhotos(e.target.files)} disabled={uploading} className="text-sm" />
            )}
            {uploading && <p className="text-xs text-[#585858] mt-1.5">Uploading.</p>}
          </div>
        </div>
      </fieldset>

      {!pending && (
        <div className="mt-6">
          <button type="button" onClick={save} disabled={saving || uploading} className={primaryBtn}>{saving ? "Saving" : "Submit for approval"}</button>
        </div>
      )}
      {msg && <p className={"mt-4 text-sm font-semibold " + (msg.ok ? "text-[#2F291E]" : "text-[#B74217]")}>{msg.text}</p>}
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return <button type="button" onClick={onBack} className="text-sm font-semibold text-[#B74217] hover:underline mb-4">&larr; Your venues</button>;
}

function WaitingChange({ pending, onWithdraw }: { pending: Pending; onWithdraw: () => void }) {
  const fmt = (v: unknown) => v == null || v === "" ? "–" : Array.isArray(v) ? (v as unknown[]).join(", ") : String(v);
  const keys = Object.keys(pending.changes || {});
  return (
    <div className="rounded-2xl bg-white border border-[#B74217]/20 p-5 mb-6">
      <p className="font-bold text-[#1a1a1a] text-sm mb-1">Waiting for approval</p>
      <p className="text-xs text-[#585858] mb-3">Submitted {new Date(pending.created_at).toLocaleDateString("en-GB")}. Nothing changes until it is approved.</p>
      <dl className="flex flex-col gap-2">
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 text-sm">
            <dt className="font-semibold text-[#2F291E]">{k.replace(/_/g, " ")}</dt>
            <dd className="text-[#585858]"><span className="line-through">{fmt(pending.current_values?.[k])}</span> &rarr; <span className="text-[#2F291E]">{fmt(pending.changes[k])}</span></dd>
          </div>
        ))}
        {pending.photo_paths && pending.photo_paths.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 text-sm">
            <dt className="font-semibold text-[#2F291E]">photos</dt>
            <dd className="text-[#585858]">{pending.photo_paths.length} waiting</dd>
          </div>
        )}
      </dl>
      <button type="button" onClick={onWithdraw} className="mt-4 text-sm font-semibold text-[#B74217] hover:underline">Withdraw this change</button>
    </div>
  );
}
