import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    // Add contact to Resend audience
    if (process.env.RESEND_AUDIENCE_ID) {
      await resend.contacts.create({
        email,
        audienceId: process.env.RESEND_AUDIENCE_ID,
      });
    }

    // Send confirmation email to the user
    await resend.emails.send({
      from: "BarkFind <hello@barkfind.com>",
      to: email,
      subject: "You're on the BarkFind early access list! 🐾",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          </head>
          <body style="margin:0;padding:0;background:#FAEFD1;font-family:'Nunito',Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAEFD1;padding:40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
                    <!-- Header -->
                    <tr>
                      <td style="background:#B74217;padding:32px;text-align:center;">
                        <p style="margin:0;font-size:48px;">🐾</p>
                        <h1 style="margin:12px 0 0;color:#ffffff;font-size:28px;font-weight:800;">You're on the list!</h1>
                      </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                      <td style="padding:32px;">
                        <p style="margin:0 0 16px;font-size:16px;color:#212121;line-height:1.6;">
                          Thanks for signing up for BarkFind early access. You're among the first to know when we launch — and we can't wait to show you what we've built.
                        </p>
                        <p style="margin:0 0 16px;font-size:16px;color:#585858;line-height:1.6;">
                          BarkFind is the community-powered map for dog owners. Discover dog-friendly cafes, parks, restaurants, vets, and more — all reviewed by people who actually bring their dogs.
                        </p>
                        <p style="margin:0 0 32px;font-size:16px;color:#585858;line-height:1.6;">
                          We'll be in touch soon with launch updates and early access instructions.
                        </p>
                        <p style="margin:0;font-size:14px;color:#585858;">
                          — The BarkFind Team 🐾
                        </p>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td style="background:#FAEFD1;padding:20px 32px;text-align:center;border-top:1px solid #e7dfc9;">
                        <p style="margin:0;font-size:12px;color:#585858;">
                          © ${new Date().getFullYear()} BarkFind · <a href="https://www.barkfind.com" style="color:#B74217;">barkfind.com</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Resend error:", err);
    return res.status(500).json({ error: "Failed to sign up. Please try again." });
  }
}
