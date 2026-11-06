// Branded transactional emails for the business portal (claim received, approved,
// declined, and change applied/declined in later tasks). The shell matches the
// Supabase auth templates in docs/emails: white card, rust logo, teal note box,
// dark footer. Sent through Resend from the server only.
//
// Voice for business-facing portal copy: first person plural (we/us/our), warm and
// plain, UK English, no em dashes, no exclamation marks, nothing that reads as
// AI-written. Signed off as "The BarkFind team".
// Files under api/_lib are not deployed as functions (leading underscore).
import { Resend } from 'resend';

const FROM = 'BarkFind <hello@barkfind.com>';
const REPLY_TO = 'info@barkfind.com';

const esc = (s = '') => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

// The shared card. `paras` are the body paragraphs (already escaped by the caller
// where they contain user input). `note`, when given, is the teal aside at the foot.
function shell(opts: { preview: string; heading: string; paras: string[]; note?: string }): string {
  const paras = opts.paras
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2F291E;">${p}</p>`)
    .join('\n');
  const note = opts.note
    ? `<tr><td class="pad" style="padding:8px 48px 36px;font-family:'Nunito',Arial,Helvetica,sans-serif;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F8F8;border-left:3px solid #4FA4A1;border-radius:12px;">
           <tr><td style="padding:14px 18px;font-size:14px;line-height:1.55;color:#2F291E;">${opts.note}</td></tr>
         </table>
       </td></tr>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light">
<title>${esc(opts.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.card{border-radius:0 !important;}.pad{padding-left:24px !important;padding-right:24px !important;}.h1{font-size:28px !important;}}</style>
</head>
<body style="margin:0;padding:0;background:#F5F1E9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1E9;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #EDE6D6;border-radius:24px;overflow:hidden;">
      <tr><td align="center" class="pad" style="padding:36px 40px 8px;">
        <a href="https://www.barkfind.com" style="text-decoration:none;">
          <img src="https://www.barkfind.com/barkfind-logo-rust.png" width="112" alt="BarkFind" style="display:block;width:112px;height:auto;border:0;">
        </a>
      </td></tr>
      <tr><td class="pad" style="padding:24px 48px 8px;font-family:'Nunito',Arial,Helvetica,sans-serif;">
        <h1 class="h1" style="margin:0 0 16px;font-family:'DM Serif Display',Georgia,'Times New Roman',serif;font-weight:400;font-size:32px;line-height:1.2;color:#1a1a1a;text-align:center;">${esc(opts.heading)}</h1>
      </td></tr>
      <tr><td class="pad" style="padding:0 48px 24px;font-family:'Nunito',Arial,Helvetica,sans-serif;">${paras}</td></tr>
      ${note}
      <tr><td align="center" style="background:#1a1a1a;padding:28px 40px;font-family:'Nunito',Arial,Helvetica,sans-serif;">
        <img src="https://www.barkfind.com/barkfind-logo-white.png" width="72" alt="BarkFind" style="display:block;width:72px;height:auto;border:0;margin:0 auto 14px;">
        <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#d6d3cc;">Dog-friendly places, found in seconds.</p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#9a958c;">&copy; 2026 BarkFind &middot; <a href="https://www.barkfind.com" style="color:#E8A07F;text-decoration:none;">barkfind.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function send(resend: Resend, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({ from: FROM, to, replyTo: REPLY_TO, subject, html });
    if (error) { console.error('business email', subject, error.name); return false; }
    return true;
  } catch (e: any) {
    console.error('business email threw', subject, e?.message);
    return false;
  }
}

// Sent when a web claim is submitted. No turnaround time is promised.
export function sendClaimReceived(resend: Resend, to: string, name: string, venue: string): Promise<boolean> {
  const who = name.trim() ? esc(name.trim().split(/\s+/)[0]) : 'there';
  const html = shell({
    preview: `We have your claim for ${venue}.`,
    heading: 'Your claim is in',
    paras: [
      `Hi ${who},`,
      `Thanks for claiming <strong>${esc(venue)}</strong> on BarkFind. We have your claim and we will look at it.`,
      `We check every claim by hand, so we will email you at this address once it is done. If we need anything else to confirm you run the venue, we will ask here.`,
      `The BarkFind team`,
    ],
    note: 'You do not need to do anything else for now. If you did not make this claim, reply to this email and let us know.',
  });
  return send(resend, to, `Your BarkFind claim for ${venue}`, html);
}

// Sent from HQ on approval (Task 3).
export function sendClaimApproved(resend: Resend, to: string, name: string, venue: string): Promise<boolean> {
  const who = name.trim() ? esc(name.trim().split(/\s+/)[0]) : 'there';
  const html = shell({
    preview: `Your claim for ${venue} is approved.`,
    heading: 'Your venue is yours to manage',
    paras: [
      `Hi ${who},`,
      `Good news: we have approved your claim for <strong>${esc(venue)}</strong>. You can now manage its listing on BarkFind.`,
      `Sign in at <a href="https://www.barkfind.com/business/manage" style="color:#B74217;">barkfind.com/business/manage</a> to edit your details, opening hours and dog-friendly amenities. Every change is checked before it goes live.`,
      `The BarkFind team`,
    ],
  });
  return send(resend, to, `You can now manage ${venue} on BarkFind`, html);
}

// Sent from HQ on decline (Task 3). The reason is required and is included here.
export function sendClaimDeclined(resend: Resend, to: string, name: string, venue: string, reason: string): Promise<boolean> {
  const who = name.trim() ? esc(name.trim().split(/\s+/)[0]) : 'there';
  const html = shell({
    preview: `About your claim for ${venue}.`,
    heading: 'About your claim',
    paras: [
      `Hi ${who},`,
      `Thanks for your claim for <strong>${esc(venue)}</strong>. We were not able to approve it this time.`,
      `<strong>Reason:</strong> ${esc(reason)}`,
      `If you think this is wrong, or you can send something that confirms you run the venue, reply to this email and we will take another look.`,
      `The BarkFind team`,
    ],
  });
  return send(resend, to, `Your BarkFind claim for ${venue}`, html);
}

// Sent from HQ when an owner's listing change is applied (Task 4).
export function sendChangeApplied(resend: Resend, to: string, name: string, venue: string): Promise<boolean> {
  const who = name.trim() ? esc(name.trim().split(/\s+/)[0]) : 'there';
  const html = shell({
    preview: `Your changes to ${venue} are live.`,
    heading: 'Your changes are live',
    paras: [
      `Hi ${who},`,
      `Your changes to <strong>${esc(venue)}</strong> have been approved and are now live on BarkFind.`,
      `You can make more changes any time at <a href="https://www.barkfind.com/business/manage" style="color:#B74217;">barkfind.com/business/manage</a>.`,
      `The BarkFind team`,
    ],
  });
  return send(resend, to, `Your changes to ${venue} are live`, html);
}

// Sent from HQ when an owner's listing change is declined (Task 4). Reason included.
export function sendChangeDeclined(resend: Resend, to: string, name: string, venue: string, reason: string): Promise<boolean> {
  const who = name.trim() ? esc(name.trim().split(/\s+/)[0]) : 'there';
  const html = shell({
    preview: `About your changes to ${venue}.`,
    heading: 'About your changes',
    paras: [
      `Hi ${who},`,
      `We were not able to apply your recent changes to <strong>${esc(venue)}</strong>.`,
      `<strong>Reason:</strong> ${esc(reason)}`,
      `You can edit and resubmit at <a href="https://www.barkfind.com/business/manage" style="color:#B74217;">barkfind.com/business/manage</a>, or reply to this email if you have a question.`,
      `The BarkFind team`,
    ],
  });
  return send(resend, to, `Your changes to ${venue}`, html);
}

// Sent from HQ when an owner's access to a venue is revoked (Task 3).
export function sendOwnerRevoked(resend: Resend, to: string, name: string, venue: string): Promise<boolean> {
  const who = name.trim() ? esc(name.trim().split(/\s+/)[0]) : 'there';
  const html = shell({
    preview: `Your access to ${venue} has been removed.`,
    heading: 'Your venue access has changed',
    paras: [
      `Hi ${who},`,
      `We have removed your access to manage <strong>${esc(venue)}</strong> on BarkFind.`,
      `If you think this is a mistake, reply to this email and we will look into it.`,
      `The BarkFind team`,
    ],
  });
  return send(resend, to, `Your BarkFind access to ${venue}`, html);
}
