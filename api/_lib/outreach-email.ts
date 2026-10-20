// Outreach email: the agreed signature (outreach-signature.html, design E4-11, chosen by Josh
// on 19 October 2026), the legal footer, the plain-text version, signed unsubscribe links and
// template rendering. GENERATED word for word from that file: do not edit the three blocks below
// by hand; change the design file and regenerate. Fields are filled server side and escaped.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HTML = "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;font-family:Arial,Helvetica,sans-serif;border:1px solid #F0E3C2;border-radius:8px;max-width:340px;width:100%;\">\n  <tr>\n    <td valign=\"middle\" style=\"padding:12px 12px 10px 16px;background:#FFFFFF;border-radius:8px 0 0 0;font-size:13px;line-height:1.45;color:#212121;\">\n      <span style=\"font-family:'DM Serif Display',Georgia,'Times New Roman',serif;font-size:19px;line-height:1.2;color:#212121;\">{{first_name}}</span><br>\n      <span style=\"color:#585858;\">{{title}}</span>\n    </td>\n    <td valign=\"middle\" align=\"right\" style=\"padding:12px 16px 10px 12px;background:#FFFFFF;border-radius:0 8px 0 0;width:64px;\">\n      <a href=\"https://www.barkfind.com\" style=\"text-decoration:none;\"><img src=\"https://www.barkfind.com/barkfind-logo-rust.png\" width=\"64\" height=\"41\" alt=\"BarkFind\" style=\"display:block;border:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#B74217;\"></a>\n    </td>\n  </tr>\n  <tr>\n    <td colspan=\"2\" style=\"padding:8px 16px;background:#FAEFD1;border-radius:0 0 8px 8px;\">\n      <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"border-collapse:collapse;\"><tr>\n        <td valign=\"middle\" style=\"font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#2F291E;\">\n          {{strapline}}<br>\n          <a href=\"https://www.barkfind.com\" style=\"color:#B74217;text-decoration:none;font-weight:bold;\">barkfind.com</a>\n        </td>\n      </tr></table>\n    </td>\n  </tr>\n</table>\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:collapse;margin-top:12px;\"><tr>\n  <td valign=\"middle\" style=\"padding:0 16px 0 0;\"><a href=\"https://apps.apple.com/gb/app/id6782144377\" style=\"text-decoration:none;\"><img src=\"https://www.barkfind.com/email/app-store-badge.png\" width=\"120\" height=\"40\" alt=\"Download on the App Store\" style=\"display:block;border:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#212121;\"></a></td>\n  <td valign=\"middle\" style=\"padding:0 10px 0 0;\"><a href=\"https://www.instagram.com/barkfind\" style=\"text-decoration:none;\"><img src=\"https://www.barkfind.com/email/instagram.png\" width=\"24\" height=\"24\" alt=\"Instagram\" style=\"display:block;border:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#B74217;\"></a></td>\n  <td valign=\"middle\"><a href=\"https://www.tiktok.com/@barkfindapp\" style=\"text-decoration:none;\"><img src=\"https://www.barkfind.com/email/tiktok.png\" width=\"24\" height=\"24\" alt=\"TikTok\" style=\"display:block;border:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#B74217;\"></a></td>\n</tr></table>";
export const FOOTER_HTML = "<p style=\"margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#585858;\">\nBarkFind Limited, company number 17093288, 80A Walliscote Road, Weston-super-Mare BS23 1ED.<br>\nNot the right person, or rather not hear from us? <a href=\"{{unsubscribe_url}}\" style=\"color:#585858;\">Unsubscribe</a>.\n</p>";
export const SIGNATURE_TEXT = "{{first_name}}\n{{title}}, BarkFind\n{{strapline}}\nbarkfind.com\nInstagram: instagram.com/barkfind\nTikTok: tiktok.com/@barkfindapp\nApp Store: apps.apple.com/gb/app/id6782144377\n\n--\nBarkFind Limited, company number 17093288, 80A Walliscote Road, Weston-super-Mare BS23 1ED.\nNot the right person, or rather not hear from us? Unsubscribe: {{unsubscribe_url}}";
export const FONT_LINK = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap";

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (t: string, v: Record<string, string>, html: boolean) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => (html ? esc(v[k] ?? '') : (v[k] ?? '')));

// Templates may use these four fields and nothing else.
export const TEMPLATE_FIELDS = ['name', 'place_name', 'place_url', 'area'] as const;
export function templateFields(s: string): string[] { return [...new Set([...s.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]))]; }
export function badFields(...parts: string[]): string[] {
  return [...new Set(parts.flatMap(templateFields))].filter((f) => !(TEMPLATE_FIELDS as readonly string[]).includes(f));
}
// Fill a template's fields; a field with no value is an error (named), never a blank.
export function renderTemplate(s: string, v: Record<string, string | null | undefined>): { out: string; missing: string[] } {
  const missing: string[] = [];
  const out = s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => { const x = v[k]; if (x == null || x === '') { missing.push(k); return ''; } return x; });
  return { out, missing: [...new Set(missing)] };
}

// Unsubscribe: an HMAC over the contact id with app_secrets.outreach_unsubscribe_key. The link
// carries the contact id and the signature, never the email address.
export const UNSUB_BASE = 'https://www.barkfind.com/api/outreach-unsubscribe';
export const unsubToken = (key: string, contactId: string) => createHmac('sha256', key).update('outreach-unsubscribe:' + contactId).digest('base64url');
export const unsubUrl = (key: string, contactId: string) => `${UNSUB_BASE}?c=${encodeURIComponent(contactId)}&t=${unsubToken(key, contactId)}`;
export function unsubValid(key: string, contactId: string, token: string): boolean {
  const want = Buffer.from(unsubToken(key, contactId)), got = Buffer.from(String(token || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

// The whole email: the body as paragraphs, the signature, the footer. Plain and personal, not a
// newsletter: white background, the body in Arial like a normal email.
export type Sender = { first_name: string; title: string; strapline: string };
const linkify = (s: string) => s.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#B74217;">$1</a>');
export function buildEmail(body: string, sender: Sender, unsubscribeUrl: string) {
  const v = { first_name: sender.first_name, title: sender.title, strapline: sender.strapline, unsubscribe_url: unsubscribeUrl };
  const paras = body.trim().split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#212121;">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`).join('\n');
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light">
<link href="${FONT_LINK}" rel="stylesheet"></head>
<body style="margin:0;padding:20px 16px;background:#FFFFFF;">
<div style="max-width:600px;">
${paras}
<div style="margin-top:22px;">
${fill(SIGNATURE_HTML, v, true)}
</div>
${fill(FOOTER_HTML, v, true)}
</div>
</body></html>`;
  const text = body.trim() + '\n\n' + fill(SIGNATURE_TEXT, v, false);
  return { html, text };
}
