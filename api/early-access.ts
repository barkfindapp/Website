import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
// Publishable/anon key — safe to use here. The early_access table has RLS with an
// insert-only policy, so this key can add signups but cannot read the list.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

type Platform = "ios" | "android";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as { email?: string; platform?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const platform: Platform = body.platform === "android" ? "android" : "ios";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  let duplicate = false;

  try {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      // Unified list — the founding-member waitlist we'll email at launch.
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await supabase.from("early_access").insert({ email, platform });
      if (error) {
        // 23505 = unique_violation → they're already on the list. Graceful, not an error.
        if (error.code === "23505") duplicate = true;
        else throw error;
      }
    } else if (process.env.RESEND_AUDIENCE_ID) {
      // Fallback until the Supabase env vars are configured, so no signup is ever lost.
      await resend.contacts
        .create({ email, audienceId: process.env.RESEND_AUDIENCE_ID })
        .catch(() => {});
    }

    // Confirmation email — best-effort; never fail the signup because of an email hiccup.
    if (!duplicate) {
      await sendConfirmation(email, platform).catch((e) => console.error("Confirmation email failed:", e));
    }

    return res.status(200).json({ success: true, duplicate });
  } catch (err) {
    console.error("early-access error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

async function sendConfirmation(email: string, platform: Platform) {
  const device = platform === "android" ? "Android" : "iPhone";
  await resend.emails.send({
    from: "BarkFind <hello@barkfind.com>",
    to: email,
    subject: "You're on the BarkFind early-access list 🐾",
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
        <body style="margin:0;padding:0;background:#F5F1E9;font-family:'Nunito',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1E9;padding:40px 20px;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
                <tr><td style="background:#B74217;padding:32px;text-align:center;">
                  <p style="margin:0;font-size:44px;">🐾</p>
                  <h1 style="margin:12px 0 0;color:#ffffff;font-size:26px;font-weight:800;">You're on the list!</h1>
                </td></tr>
                <tr><td style="padding:32px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#2F291E;line-height:1.6;">
                    Thanks for joining BarkFind early access. We'll email you the moment we launch on ${device} — with your founding-member offer.
                  </p>
                  <p style="margin:0 0 16px;font-size:16px;color:#585858;line-height:1.6;">
                    Founding members get first shot at our launch pricing: your <strong>first year for £19.99</strong> instead of £39.99. It's limited to our first <strong>500 members</strong>, so keep an eye on your inbox around launch.
                  </p>
                  <p style="margin:0 0 24px;font-size:14px;color:#8a8a8a;line-height:1.6;">
                    Early access gives you first shot at the offer — it isn't a guaranteed slot, and the offer arrives when we launch, not before.
                  </p>
                  <p style="margin:0;font-size:14px;color:#585858;">— The BarkFind team 🐾</p>
                </td></tr>
                <tr><td style="background:#F5F1E9;padding:20px 32px;text-align:center;border-top:1px solid #e7dfc9;">
                  <p style="margin:0;font-size:12px;color:#585858;">© ${new Date().getFullYear()} BarkFind · <a href="https://www.barkfind.com" style="color:#B74217;">barkfind.com</a></p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
      </html>
    `,
  });
}
