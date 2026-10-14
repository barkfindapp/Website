import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
// Publishable/anon key: early_access has insert-only RLS, and founder_offer_status
// is callable by anon. Same key the website already uses.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

// The App Store id, as used on the creator pages. The offer code is never
// hardcoded: it comes from founder_offer_status() and the link is built from it.
const APP_ID = "6782144377";
const redeemUrl = (code: string) =>
  `https://apps.apple.com/redeem?ctx=offercodes&id=${APP_ID}&code=${encodeURIComponent(code)}`;
const APP_STORE_URL = `https://apps.apple.com/gb/app/id${APP_ID}`;
const UNSUB = "mailto:support@barkfind.com?subject=Unsubscribe";

// Basic per-IP rate limit: 5 a minute. In-memory, so per serverless instance.
const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now - e.t > 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  e.n += 1;
  return e.n > 5;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many requests. Please try again in a minute." });

  const body = (req.body ?? {}) as { email?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  // Test-only override to exercise the closed email, honoured outside production
  // so the live site is never affected. Never changes the database.
  const forceClosed = process.env.VERCEL_ENV !== "production" && req.query?.test_closed === "1";

  try {
    let open = true;
    let code: string | null = null;

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Add to the waitlist. 23505 = already on the list, treat as success.
      const { error: insErr } = await supabase.from("early_access").insert({ email, platform: "ios" });
      if (insErr && insErr.code !== "23505") console.error("founder insert:", insErr);
      // Authoritative offer state, server-side.
      const { data: status } = await supabase.rpc("founder_offer_status");
      if (status && typeof (status as { open?: boolean }).open === "boolean") {
        open = (status as { open: boolean; code: string | null }).open;
        code = (status as { open: boolean; code: string | null }).code ?? null;
      }
    }
    if (forceClosed) { open = false; code = null; }

    // Newsletter audience, best-effort.
    if (AUDIENCE_ID) {
      await resend.contacts.create({ email, audienceId: AUDIENCE_ID }).catch(() => {});
    }

    const founder = open && !!code;
    if (founder) await sendFounderEmail(email, redeemUrl(code as string)).catch((e) => console.error("founder email:", e));
    else await sendClosedEmail(email).catch((e) => console.error("closed email:", e));

    return res.status(200).json({ ok: true, founder });
  } catch (err) {
    console.error("founder error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

// ---------- emails (brand layout from docs/emails/email-confirm-sign-up.html) ----------

function layout(o: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  button?: { label: string; url: string };
  noteHtml?: string;
  afterHtml?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>BarkFind</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @media (max-width: 620px) {
    .card { border-radius: 0 !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .h1 { font-size: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#F5F1E9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E9;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #EDE6D6;border-radius:24px;overflow:hidden;">
      <tr><td align="center" class="pad" style="padding:36px 40px 8px;">
        <a href="https://www.barkfind.com" style="text-decoration:none;">
          <img src="https://www.barkfind.com/barkfind-logo-rust.png" width="112" alt="BarkFind" style="display:block;width:112px;height:auto;border:0;">
        </a>
      </td></tr>
      <tr><td class="pad" style="padding:24px 48px 8px;font-family:'Nunito',Arial,Helvetica,sans-serif;">
        <h1 class="h1" style="margin:0 0 16px;font-family:'DM Serif Display',Georgia,'Times New Roman',serif;font-weight:400;font-size:32px;line-height:1.2;color:#1a1a1a;text-align:center;">${o.heading}</h1>
        ${o.bodyHtml}
      </td></tr>
      ${o.button ? `<tr><td align="center" style="padding:0 40px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#B74217" style="border-radius:999px;">
            <a href="${o.button.url}" style="display:inline-block;padding:15px 34px;font-family:'Nunito',Arial,Helvetica,sans-serif;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:999px;">${o.button.label}</a>
          </td>
        </tr></table>
      </td></tr>` : ""}
      ${o.noteHtml ? `<tr><td class="pad" style="padding:0 48px 24px;font-family:'Nunito',Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F8F8;border-left:3px solid #4FA4A1;border-radius:12px;">
          <tr><td style="padding:14px 18px;font-size:14px;line-height:1.55;color:#2F291E;">${o.noteHtml}</td></tr>
        </table>
      </td></tr>` : ""}
      ${o.afterHtml ? `<tr><td class="pad" style="padding:0 48px 36px;font-family:'Nunito',Arial,Helvetica,sans-serif;">${o.afterHtml}</td></tr>` : ""}
      <tr><td align="center" style="background:#1a1a1a;padding:28px 40px;font-family:'Nunito',Arial,Helvetica,sans-serif;">
        <img src="https://www.barkfind.com/barkfind-logo-white.png" width="72" alt="BarkFind" style="display:block;width:72px;height:auto;border:0;margin:0 auto 14px;">
        <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#d6d3cc;">Dog-friendly places, found in seconds.</p>
        <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#9a958c;">You are getting this because you signed up at barkfind.com. <a href="${UNSUB}" style="color:#E8A07F;text-decoration:none;">Unsubscribe</a>.</p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#9a958c;">&copy; ${new Date().getFullYear()} BarkFind &middot; <a href="https://www.barkfind.com" style="color:#E8A07F;text-decoration:none;">barkfind.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const P = (html: string) =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#585858;text-align:center;">${html}</p>`;

async function sendFounderEmail(email: string, link: string) {
  const html = layout({
    preheader: "Your first year of Premium for £19.99.",
    heading: "You're one of our first 100",
    bodyHtml: P("Thanks for joining BarkFind early. Your founding-member link gives you your first year of BarkFind Premium for £19.99 instead of £39.99, paid when you sign up."),
    button: { label: "Claim my founding price", url: link },
    noteHtml: "Open this link on your iPhone before you sign up in the app, so the founding price is applied. It renews at £39.99 a year unless you cancel at least 24 hours before the renewal date, which you can do any time in your App Store settings.",
    afterHtml: `${P("Places are limited to our first 100 members, so it may stop working once they have gone.")}<p style="margin:0;font-size:16px;line-height:1.6;color:#585858;text-align:center;">Josh, BarkFind</p>`,
  });
  const text = [
    "You're one of our first 100",
    "",
    "Thanks for joining BarkFind early. Your founding-member link gives you your first year of BarkFind Premium for £19.99 instead of £39.99, paid when you sign up.",
    "",
    `Claim my founding price: ${link}`,
    "",
    "Open this link on your iPhone before you sign up in the app, so the founding price is applied. It renews at £39.99 a year unless you cancel at least 24 hours before the renewal date, which you can do any time in your App Store settings.",
    "",
    "Places are limited to our first 100 members, so it may stop working once they have gone.",
    "",
    "Josh, BarkFind",
    "",
    `Unsubscribe: ${UNSUB}`,
  ].join("\n");
  await resend.emails.send({
    from: "Josh at BarkFind <support@barkfind.com>",
    replyTo: "support@barkfind.com",
    to: email,
    subject: "Your BarkFind founding-member link",
    html,
    text,
    headers: { "List-Unsubscribe": `<${UNSUB}>` },
  });
}

async function sendClosedEmail(email: string) {
  const html = layout({
    preheader: "The founding places have gone, but BarkFind is free to download.",
    heading: "Founding places have gone",
    bodyHtml: P("All 100 founding places have been taken. Thank you for your interest. You can still download BarkFind free and start a 14-day free trial."),
    button: { label: "Download BarkFind", url: APP_STORE_URL },
    afterHtml: `<p style="margin:0;font-size:16px;line-height:1.6;color:#585858;text-align:center;">Josh, BarkFind</p>`,
  });
  const text = [
    "Founding places have gone",
    "",
    "All 100 founding places have been taken. Thank you for your interest. You can still download BarkFind free and start a 14-day free trial.",
    "",
    `Download BarkFind: ${APP_STORE_URL}`,
    "",
    "Josh, BarkFind",
    "",
    `Unsubscribe: ${UNSUB}`,
  ].join("\n");
  await resend.emails.send({
    from: "Josh at BarkFind <support@barkfind.com>",
    replyTo: "support@barkfind.com",
    to: email,
    subject: "BarkFind founding places have gone",
    html,
    text,
    headers: { "List-Unsubscribe": `<${UNSUB}>` },
  });
}
