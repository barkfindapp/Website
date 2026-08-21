import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { business, name, email, message } = req.body as {
    business?: string;
    name?: string;
    email?: string;
    message?: string;
  };

  if (!business?.trim() || !name?.trim() || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please complete the required fields with a valid email." });
  }

  const esc = (s = "") => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

  try {
    await resend.emails.send({
      from: "BarkFind <hello@barkfind.com>",
      to: "info@barkfind.com",
      replyTo: email,
      subject: `New business enquiry, ${business.trim()}`,
      html: `
        <h2>New business enquiry</h2>
        <p><strong>Business:</strong> ${esc(business)}</p>
        <p><strong>Contact:</strong> ${esc(name)}</p>
        <p><strong>Email:</strong> ${esc(email)}</p>
        <p><strong>Message:</strong></p>
        <p>${esc(message) || "(none)"}</p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Business enquiry error:", err);
    return res.status(500).json({ error: "Failed to send. Please email info@barkfind.com directly." });
  }
}
