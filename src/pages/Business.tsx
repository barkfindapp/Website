import { useState } from "react";
import PageShell, { Section } from "../components/PageShell";

const BENEFITS = [
  {
    title: "Get discovered by dog owners",
    body: "BarkFind users are actively searching for dog-friendly places to eat, drink, and explore. Make sure yours is one they find.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    title: "Claim your listing for free",
    body: "Take ownership of your venue, keep your details and dog-friendly amenities accurate, and show up correctly on the map.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Build trust with real reviews",
    body: "Paw ratings and reviews from genuine dog owners build confidence, and bring more four-legged customers through your door.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    title: "Promote offers & sponsored placement",
    body: "Run exclusive in-app promotions and boost your visibility with sponsored placement to reach even more local dog owners.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5.172 5.172a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 9V4a1 1 0 011-1z" />
      </svg>
    ),
  },
];

function EnquiryForm() {
  const [form, setForm] = useState({ business: "", name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/business-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Something went wrong. Please email info@barkfind.com directly.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-2xl bg-[#FAEFD1] border border-[#B74217]/15 p-8 text-center">
        <p className="font-serif text-2xl text-[#1a1a1a] mb-2">Thanks, we've got it! 🐾</p>
        <p className="text-sm text-[#585858]">
          Our team will be in touch at the email you provided. In the meantime, feel free to reach us at{" "}
          <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-[#1a1a1a] outline-none focus:border-[#B74217] focus:ring-2 focus:ring-[#B74217]/15 bg-white";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">Business name *</label>
          <input required value={form.business} onChange={update("business")} className={inputClass} placeholder="The Barking Dog Pub" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">Your name *</label>
          <input required value={form.name} onChange={update("name")} className={inputClass} placeholder="Jane Smith" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">Email *</label>
        <input required type="email" value={form.email} onChange={update("email")} className={inputClass} placeholder="you@business.com" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1.5">How can we help?</label>
        <textarea value={form.message} onChange={update("message")} rows={4} className={inputClass} placeholder="Tell us about your venue and what you're interested in (claiming your listing, promotions, sponsored placement)…" />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-1 px-6 py-3.5 rounded-full bg-[#B74217] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 shadow-sm shadow-[#B74217]/20"
      >
        {status === "loading" ? "Sending…" : "Send enquiry"}
      </button>
      {status === "error" && <p className="text-sm text-[#B74217]">{errorMsg}</p>}
      <p className="text-xs text-[#585858]">
        Prefer email? Reach us at{" "}
        <a href="mailto:info@barkfind.com" className="text-[#B74217] font-semibold hover:underline">info@barkfind.com</a>.
      </p>
    </form>
  );
}

export default function Business() {
  return (
    <PageShell
      title="BarkFind for Businesses"
      subtitle="Reach dog owners who are actively looking for places like yours, cafes, pubs, restaurants, shops, and more."
    >
      <Section title="Why list on BarkFind">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl bg-white border border-stone-100 shadow-sm shadow-stone-100 p-6 flex flex-col gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#FAEFD1] flex items-center justify-center text-[#B74217]">{b.icon}</div>
              <h3 className="font-bold text-[#1a1a1a] text-base">{b.title}</h3>
              <p className="text-sm text-[#585858] leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="How it works">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            ["1", "Get in touch", "Send us your details using the form below."],
            ["2", "Verify your venue", "We confirm you're the owner or manager of the business."],
            ["3", "Manage & promote", "Keep your listing accurate, respond to reviews, and run promotions."],
          ].map(([n, t, d]) => (
            <div key={n} className="flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white shadow-md shadow-[#B74217]/10 flex items-center justify-center">
                <span className="font-serif text-lg font-bold text-[#B74217]">{n}</span>
              </div>
              <p className="font-bold text-[#1a1a1a]">{t}</p>
              <p className="text-sm text-[#585858] leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Get in touch">
        <p>Fill in the form and our team will get back to you about claiming your listing, promotions, or sponsored placement.</p>
        <div className="mt-2">
          <EnquiryForm />
        </div>
      </Section>
    </PageShell>
  );
}
