// Outreach email from HQ: templates, a preview, and one send at a time (no bulk send).
// Sends go through Resend on hello.barkfind.com with RESEND_OUTREACH_API_KEY only (never the
// support or alerts keys), from the sender's own name and address set in Admin, Team, with
// replies to their own inbox. Every send: suppression list checked, 14 days since HQ last emailed
// the contact (unless forced, which is recorded), the sender's daily cap (app_config
// outreach_daily_cap, default 15, 429 when reached), the full body logged, Contacted and a
// follow-up 10 days out, and an audit row. No open or click tracking.
import type { Pool, PoolClient } from 'pg';
import { HttpError, only, uuid, str, oneOf, bool, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';
import { badFields, renderTemplate, buildEmail, unsubUrl, FIELD_INFO, UNSUB_BASE } from './outreach-email.js';

const RESEND_KEY = process.env.RESEND_OUTREACH_API_KEY || '';
const APP_STORE_URL = 'https://apps.apple.com/gb/app/id6782144377';
const T_KINDS = ['any', 'creator', 'creator_prospect', 'venue', 'press', 'partner', 'community', 'other'] as const;
const GAP_DAYS = 14, FOLLOW_UP_DAYS = 10, DEFAULT_CAP = 15;
const TODAY_UK = "(now() at time zone 'Europe/London')::date";
// HQ's own sends are the log rows with a Resend id.
const SENT = `g.channel = 'email' and g.direction = 'out' and g.provider_id is not null`;

async function cfg(q: Pool | PoolClient, key: string) {
  return (await q.query('select value from public.app_config where key = $1', [key])).rows[0]?.value ?? null;
}
async function secret(q: Pool | PoolClient, name: string) {
  return (await q.query('select value from public.app_secrets where name = $1', [name])).rows[0]?.value ?? null;
}

// What each template field becomes for this contact. Nothing (null) means the field is missing
// and the send is blocked, rather than a gap in the sentence.
const plain = (v: unknown) => String(v ?? '').replace(/[\u2009\u202f\u00a0]/g, ' ').replace(/\s*[\u2013\u2014]\s*/g, ' to ').trim() || null;
function clip(v: unknown, n: number) { const t = plain(v); if (!t || t.length <= n) return t; return t.slice(0, t.lastIndexOf(' ', n) > n * 0.6 ? t.lastIndexOf(' ', n) : n).replace(/[\s,.;:]+$/, '') + '...'; }
function fieldValues(c: any): Record<string, string | null> {
  const n = c.review_count == null ? 0 : Number(c.review_count);
  const hours = Array.isArray(c.opening_hours) ? c.opening_hours.map(plain).filter(Boolean).join('\n') : null;
  return {
    name: c.name, area: c.area,
    place_name: c.place_name, place_address: c.place_address,
    place_category: c.place_category ? String(c.place_category).replace(/_/g, ' ') : null,
    place_url: c.place_name ? APP_STORE_URL : null, website: c.website || null,
    barkfind_rating: c.barkfind_rating != null ? Number(c.barkfind_rating).toFixed(1) : null,
    review_count: n > 0 ? `${n} review${n === 1 ? '' : 's'}` : null,
    google_rating: c.google_rating != null ? Number(c.google_rating).toFixed(1) : null,
    description: plain(c.description), mylo_verdict: plain(c.mylo_verdict), mylo_best_for: plain(c.mylo_best_for),
    opening_hours: hours || null,
    // Reviews are quoted as written (apart from spacing), cut at a word near 300 characters.
    latest_review: c.latest_review ? clip(String(c.latest_review).replace(/\s+/g, ' '), 300) : null,
    latest_review_paws: c.latest_review_paws != null ? `${c.latest_review_paws} paw${Number(c.latest_review_paws) === 1 ? '' : 's'}` : null,
  };
}

// Everything a send needs, read the same way for the preview and the send itself.
async function prepare(q: Pool | PoolClient, userId: string, a: Record<string, unknown>) {
  const id = uuid(a.id);
  const c = (await q.query(
    `select o.id, o.name, o.kind, o.area, o.email, o.status, l.name as place_name, l.address as place_address,
            coalesce(l.categories[1], l.category) as place_category, l.website, l.barkfind_rating, l.review_count, l.google_rating,
            l.description, l.mylo_verdict, l.mylo_best_for, l.opening_hours, rv.review_text as latest_review, rv.paw_rating as latest_review_paws
       from public.hq_outreach o left join public.locations l on l.id = o.location_id
       left join lateral (select r.review_text, r.paw_rating from public.reviews r
                           where r.location_id = l.id and r.status = 'approved' and coalesce(btrim(r.review_text), '') <> ''
                           order by r.created_at desc limit 1) rv on true
      where o.id = $1`, [id])).rows[0];
  if (!c) throw new HttpError(404, 'That contact no longer exists.');
  let subject: string, body: string, templateId: string | null = null;
  if (a.template_id) {
    templateId = uuid(a.template_id);
    const t = (await q.query('select subject, body from public.outreach_templates where id = $1', [templateId])).rows[0];
    if (!t) throw new HttpError(404, 'That template no longer exists.');
    subject = t.subject; body = t.body;
  } else {
    subject = str(a.subject, 200, { min: 1 }); body = str(a.body, 5000, { min: 1 });
  }
  const bad = badFields(subject, body);
  if (bad.length) throw new HttpError(400, `HQ cannot fill {{${bad.join('}}, {{')}}}. Use Insert a field to pick one it knows.`);
  const values = fieldValues(c);
  const s = renderTemplate(subject, values), b = renderTemplate(body, values);
  s.out = s.out.replace(/\s*\n\s*/g, ', ');   // a subject is one line, even with opening hours in it
  const missing = [...new Set([...s.missing, ...b.missing])];

  const me = (await q.query(`select display_name, outreach_from_name, outreach_from_email, outreach_reply_to, outreach_title from public.hq_staff where user_id = $1`, [userId])).rows[0] || {};
  const senderReady = !!(me.outreach_from_name && me.outreach_from_email && me.outreach_reply_to);
  const email = String(c.email || '').trim().toLowerCase();
  const [supp, last, today, capRaw, strap, key] = await Promise.all([
    email ? q.query('select reason, created_at from public.outreach_suppression where email = $1', [email]) : Promise.resolve({ rows: [] as any[] }),
    q.query(`select max(g.at) as at from public.hq_outreach_log g where g.outreach_id = $1 and ${SENT}`, [id]),
    q.query(`select count(*)::int as n from public.hq_outreach_log g where g."by" = $1 and ${SENT} and (g.at at time zone 'Europe/London')::date = ${TODAY_UK}`, [userId]),
    cfg(q, 'outreach_daily_cap'), cfg(q, 'outreach_strapline'), secret(q, 'outreach_unsubscribe_key'),
  ]);
  const cap = Number.isInteger(Number(capRaw)) && Number(capRaw) > 0 ? Number(capRaw) : DEFAULT_CAP;
  const lastAt: Date | null = last.rows[0]?.at ? new Date(last.rows[0].at) : null;
  const recent = !!lastAt && Date.now() - lastAt.getTime() < GAP_DAYS * 864e5;
  const firstName = String(me.display_name || me.outreach_from_name || '').trim().split(/\s+/)[0] || '';
  const built = key ? buildEmail(b.out, { first_name: firstName, title: me.outreach_title || '', strapline: strap || '' }, unsubUrl(key, id)) : null;
  // No title: the plain-text signature line reads "BarkFind" rather than ", BarkFind".
  const text = built ? built.text.replace(/\n, BarkFind\n/, '\nBarkFind\n') : '';

  const blockers: string[] = [];
  if (!email) blockers.push('This contact has no email address. Add one in Edit details.');
  if (supp.rows[0]) blockers.push(`This address must not be emailed: it ${supp.rows[0].reason === 'manual' ? 'was added to the do-not-email list' : supp.rows[0].reason === 'unsubscribed' ? 'unsubscribed' : supp.rows[0].reason === 'bounced' ? 'bounced' : 'marked an email as spam'}.`);
  if (!senderReady) blockers.push('Your outreach sender is not set. Ask an owner to add your From name, From address and reply-to in Admin, Team.');
  if (missing.length) {
    const label = (k: string) => FIELD_INFO.find((f) => f.key === k)?.label.toLowerCase() || k;
    const place = missing.some((k) => FIELD_INFO.find((f) => f.key === k)?.group === 'Place');
    blockers.push(`Nothing to fill in for ${missing.map(label).join(', ')}. ${place && !c.place_name ? 'This contact has no linked place: link one in Edit details, or ' : 'Take that field out, or '}use a template without it.`);
  }
  if (!key) blockers.push('The unsubscribe key is not set up yet (the hq_outreach_send migration).');
  if (!RESEND_KEY) blockers.push('Sending is not set up on the server (RESEND_OUTREACH_API_KEY).');
  if (today.rows[0].n >= cap) blockers.push(`You have sent ${today.rows[0].n} of ${cap} outreach emails today. The limit resets at midnight.`);

  return {
    contact: c, email, templateId, subject: s.out, html: built?.html || '', text,
    from: senderReady ? `${me.outreach_from_name} <${me.outreach_from_email}>` : null, reply_to: me.outreach_reply_to || null,
    unsubscribe: key ? unsubUrl(key, id) : null, recent, last_at: lastAt ? lastAt.toISOString() : null,
    sent_today: today.rows[0].n, cap, blockers,
  };
}

export function outreachSendOps(pool: Pool): Record<string, Op> {
  return {
    // ---------- templates ----------
    outreach_templates: {
      perm: 'outreach_view',
      run: async (a) => {
        only(a, []);
        const r = await pool.query(`select t.id, t.kind, t.name, t.subject, t.body, t.updated_at, coalesce(s.display_name, s.email) as updated_by_name
                                      from public.outreach_templates t left join public.hq_staff s on s.user_id = t.updated_by order by t.kind, t.name`);
        return { data: { templates: r.rows, fields: FIELD_INFO } };
      },
    },
    outreach_template_save: {
      perm: 'outreach_edit',
      run: async (a, ctx) => {
        only(a, ['id', 'kind', 'name', 'subject', 'body']);
        const id = a.id ? uuid(a.id) : null;
        const kind = oneOf(a.kind, T_KINDS);
        const name = str(a.name, 80, { min: 1 }), subject = str(a.subject, 200, { min: 1 }), body = str(a.body, 5000, { min: 1 });
        const bad = badFields(subject, body);
        if (bad.length) throw new HttpError(400, `HQ cannot fill {{${bad.join('}}, {{')}}}. Use Insert a field to pick one it knows.`);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = id ? (await c.query('select to_jsonb(t) as r from public.outreach_templates t where id = $1', [id])).rows[0]?.r ?? null : null;
          if (id && !before) throw new HttpError(404, 'That template no longer exists.');
          let row;
          try {
            row = id
              ? (await c.query('update public.outreach_templates set kind = $2, name = $3, subject = $4, body = $5, updated_at = now(), updated_by = $6 where id = $1 returning *', [id, kind, name, subject, body, ctx.staff.userId])).rows[0]
              : (await c.query('insert into public.outreach_templates (kind, name, subject, body, updated_by) values ($1, $2, $3, $4, $5) returning *', [kind, name, subject, body, ctx.staff.userId])).rows[0];
          } catch (e: any) { if (e?.code === '23505') throw new HttpError(409, 'There is already a template with that name.'); throw e; }
          await audit({ action: 'outreach_template_save', entity: 'outreach_templates', entityId: row.id, detail: `${id ? 'Saved' : 'Added'} email template ${name}`, before, after: row });
          return { ok: true, message: id ? 'Template saved.' : 'Template added.', id: row.id };
        });
      },
    },

    // ---------- preview: exactly what would be sent, and anything stopping it ----------
    outreach_send_preview: {
      perm: 'outreach_send',
      run: async (a, ctx) => {
        only(a, ['id', 'template_id', 'subject', 'body']);
        const p = await prepare(pool, ctx.staff.userId, a);
        // The preview's unsubscribe link goes to a page that changes nothing; only the sent email carries the real one.
        const inert = (x: string) => (p.unsubscribe ? x.split(p.unsubscribe).join(UNSUB_BASE + '?preview=1') : x);
        return { data: { to: p.email || null, from: p.from, reply_to: p.reply_to, subject: p.subject, html: inert(p.html), text: inert(p.text),
          recent: p.recent, last_at: p.last_at, sent_today: p.sent_today, cap: p.cap, blockers: p.blockers } };
      },
    },

    // ---------- send one email ----------
    outreach_send: {
      perm: 'outreach_send',
      run: async (a, ctx) => {
        only(a, ['id', 'template_id', 'subject', 'body', 'force']);
        const force = 'force' in a ? bool(a.force) : false;
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          // One send at a time per sender (so the daily cap holds), and per contact.
          await c.query("select pg_advisory_xact_lock(hashtext('outreach_send:' || $1))", [ctx.staff.userId]);
          const id = uuid(a.id);
          const locked = (await c.query('select id from public.hq_outreach where id = $1 for update', [id])).rows[0];
          if (!locked) throw new HttpError(404, 'That contact no longer exists.');
          const before = (await c.query('select to_jsonb(o) as r from public.hq_outreach o where o.id = $1', [id])).rows[0].r;
          const p = await prepare(c, ctx.staff.userId, a);
          const capHit = p.sent_today >= p.cap;
          const others = p.blockers.filter((b) => !b.startsWith('You have sent'));
          if (others.length) throw new HttpError(409, others[0]);
          if (capHit) throw new HttpError(429, `You have sent ${p.sent_today} of ${p.cap} outreach emails today. The limit resets at midnight.`);
          if (p.recent && !force) throw new HttpError(409, `HQ emailed this contact on ${new Date(p.last_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })}, less than ${GAP_DAYS} days ago. Tick "Send anyway" to send again.`);

          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': `outreach-${id}-${Date.now()}` },
            body: JSON.stringify({
              from: p.from, to: [p.email], reply_to: p.reply_to, subject: p.subject, html: p.html, text: p.text,
              headers: { 'List-Unsubscribe': `<${p.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
            }),
          });
          const out: any = await res.json().catch(() => ({}));
          if (!res.ok || !out?.id) {
            console.error('hq outreach send', res.status, JSON.stringify(out).slice(0, 300));
            throw new HttpError(502, `Resend did not send it${out?.message ? ': ' + String(out.message).slice(0, 160) : '.'} Nothing was logged.`);
          }
          await c.query(
            `insert into public.hq_outreach_log (outreach_id, note, channel, direction, body, "by", provider_id)
             values ($1, $2, 'email', 'out', $3, $4, $5)`,
            [id, `Emailed from HQ: ${p.subject}${p.recent && force ? ' (sent again within ' + GAP_DAYS + ' days)' : ''}`, `Subject: ${p.subject}\n\n${p.text}`, ctx.staff.userId, out.id]);
          await c.query(
            `update public.hq_outreach set last_contact_at = now(), status = case when status = 'to_contact' then 'contacted' else status end,
                    next_follow_up = ${TODAY_UK} + ${FOLLOW_UP_DAYS}, updated_at = now() where id = $1`, [id]);
          const after = (await c.query('select to_jsonb(o) as r from public.hq_outreach o where o.id = $1', [id])).rows[0].r;
          await audit({ action: 'outreach_send', entity: 'hq_outreach', entityId: id,
            detail: `Emailed ${p.contact.name} from HQ: ${p.subject}${force && p.recent ? ' (forced: last emailed ' + p.last_at!.slice(0, 10) + ')' : ''}`.slice(0, 300),
            before, after: { ...after, email: { to: p.email, from: p.from, reply_to: p.reply_to, subject: p.subject, template_id: p.templateId, provider_id: out.id, forced: force && p.recent, last_emailed_at: p.last_at } } });
          return { ok: true, message: `Sent to ${p.email}. Follow up set for ${FOLLOW_UP_DAYS} days' time.` };
        });
      },
    },

    // ---------- the sender, per member of staff (Admin, Team; owners only) ----------
    team_set_sender: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, ['user_id', 'from_name', 'from_email', 'reply_to', 'title']);
        if (ctx.staff.level !== 'owner') throw new HttpError(403, 'Only an owner can set who outreach email is sent from.');
        const userId = uuid(a.user_id);
        const fromName = str(a.from_name, 80, { optional: true }) || null;
        const fromEmail = (str(a.from_email, 200, { optional: true }) || '').toLowerCase() || null;
        const replyTo = (str(a.reply_to, 200, { optional: true }) || '').toLowerCase() || null;
        const title = str(a.title, 60, { optional: true }) || null;
        if (fromEmail && !/^[a-z0-9._%+-]+@hello\.barkfind\.com$/.test(fromEmail)) throw new HttpError(400, 'The From address must be on hello.barkfind.com, for example megan@hello.barkfind.com.');
        if (replyTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo)) throw new HttpError(400, 'Check the reply-to address.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const pick = 'select user_id, email, display_name, outreach_from_name, outreach_from_email, outreach_reply_to, outreach_title from public.hq_staff where user_id = $1';
          const before = (await c.query(pick, [userId])).rows[0];
          if (!before) throw new HttpError(404, 'That person is not on the team.');
          await c.query('update public.hq_staff set outreach_from_name = $2, outreach_from_email = $3, outreach_reply_to = $4, outreach_title = $5, updated_at = now() where user_id = $1',
            [userId, fromName, fromEmail, replyTo, title]);
          const after = (await c.query(pick, [userId])).rows[0];
          await audit({ action: 'team_set_sender', entity: 'hq_staff', entityId: userId, detail: `Set the outreach sender for ${before.display_name || before.email}`, before, after });
          return { ok: true, message: fromName && fromEmail && replyTo ? 'Sender saved.' : 'Saved. Sending stays off until name, address and reply-to are all set.' };
        });
      },
    },
  };
}
