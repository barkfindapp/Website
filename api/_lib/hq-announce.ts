// Phase 2: Announcements. An in-app message to a segment of customers, inserted into
// public.notifications as type 'system', entity 'none', the same as /admin did. Nothing
// here sends a push or an email: notifications has no trigger, so it only shows in the app.
// Each send is tagged in notifications.metadata (announcement_id, sent_by, segment) so a
// delete removes exactly that send. Untagged system messages (older /admin sends, and the
// automatic "Your free trial ends" reminders, which look the same) are listed read-only:
// HQ only deletes its own tagged sends. Deletes copy every row to hq_trash.
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { HttpError, bad, only, uuid, str, oneOf, writeTx, toTrash } from './hq-core.js';
import type { Op } from './hq-act.js';

// 'me' is a test group: only the signed-in staff member's own account.
const SEGMENTS = ['all', 'subscribed', 'trial', 'free', 'me'] as const;
type Segment = typeof SEGMENTS[number];
const SCREENS = ['explore', 'upgrade', 'reviews', 'dogProfile', 'onboarding'] as const;
const LOCATION_RE = /^location:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTPS_RE = /^https:\/\/[^\s<>"]+$/i;

// Who each segment reaches. Fixed SQL fragments chosen by key; banned customers are left out.
const WHO: Record<Segment, string> = {
  me: 'p.user_id = $ME',
  all: 'true',
  subscribed: "exists (select 1 from public.subscriptions s where s.user_id = p.user_id and s.status = 'active')",
  trial: "exists (select 1 from public.subscriptions s where s.user_id = p.user_id and s.status = 'trial')",
  free: "not exists (select 1 from public.subscriptions s where s.user_id = p.user_id and s.status in ('active', 'trial'))",
};
// $ME is replaced with the parameter number that holds the staff member's user id.
const recipients = (seg: Segment, me: number) => `from public.profiles p where not coalesce(p.is_banned, false) and ${WHO[seg].replace('$ME', '$' + me)}`;
const ANN = "n.type = 'system' and n.entity = 'none' and not coalesce(n.is_demo, false)";

// A link is optional: an app screen, a place (location:<id>) or a web page (https).
function link(v: unknown): string {
  const s = str(v, 500, { optional: true });
  if (!s) return '';
  if ((SCREENS as readonly string[]).includes(s) || LOCATION_RE.test(s) || HTTPS_RE.test(s)) return s;
  throw bad();
}

export function announceOps(pool: Pool): Record<string, Op> {
  return {
    // How many customers each segment reaches right now.
    announce_preview: {
      perm: 'announce',
      run: async (a, ctx) => {
        only(a, []);
        const r = await pool.query(
          `select ${SEGMENTS.map((s) => `(select count(*)::int ${recipients(s, 1)}) as ${s}`).join(', ')}`, [ctx.staff.userId]);
        return { data: r.rows[0] };
      },
    },

    announce_send: {
      perm: 'announce',
      run: async (a, ctx) => {
        only(a, ['title', 'message', 'url', 'segment', 'confirm']);
        if (a.confirm !== 'SEND') throw new HttpError(400, 'Type SEND to confirm.');
        const title = str(a.title, 100, { min: 1 }), message = str(a.message, 600, { min: 1 });
        const url = link(a.url), seg = oneOf(a.segment, SEGMENTS) as Segment;
        const id = randomUUID();
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          await c.query('select pg_advisory_xact_lock(hashtext($1))', ['announce_send']);
          const dup = await c.query(
            `select 1 from public.notifications n where ${ANN} and n.title = $1 and n.message = $2 and n.created_at > now() - interval '10 minutes' limit 1`,
            [title, message]);
          if (dup.rows[0]) throw new HttpError(409, 'That announcement went out in the last 10 minutes. It was not sent again.');
          const meta = JSON.stringify({ announcement_id: id, sent_by: ctx.staff.userId, segment: seg });
          const r = await c.query(
            `insert into public.notifications (user_id, type, entity, title, message, action_url, is_read, is_demo, metadata)
             select p.user_id, 'system', 'none', $1, $2, nullif($3, ''), false, false, $4::jsonb ${recipients(seg, 5)}`,
            [title, message, url, meta, ctx.staff.userId]);
          const n = r.rowCount || 0;
          if (!n) throw new HttpError(409, seg === 'me' ? 'Your HQ account has no BarkFind app profile, so there is nobody to send the test to.' : 'Nobody is in that group, so nothing was sent.');
          await audit({ action: 'announce_send', entity: 'notifications', entityId: id,
            detail: seg === 'me' ? `Sent test announcement "${title.slice(0, 80)}" to own account` : `Sent announcement "${title.slice(0, 80)}" to ${n} ${seg === 'all' ? 'customers' : seg + ' customers'}`,
            before: null, after: { announcement_id: id, title, message, action_url: url || null, segment: seg, recipients: n } });
          return { ok: true, message: `Sent to ${n.toLocaleString('en-GB')} ${n === 1 ? 'person' : 'people'}. It shows in their notifications in the app.`, id, recipients: n };
        });
      },
    },

    // Recent sends, newest first: tagged sends by id, older /admin sends by title and message.
    announce_list: {
      perm: 'announce',
      run: async (a) => {
        only(a, []);
        const r = await pool.query(
          `select n.metadata->>'announcement_id' as id, n.title, n.message, min(n.action_url) as action_url,
                  min(n.metadata->>'segment') as segment, min(n.metadata->>'sent_by') as sent_by,
                  count(*)::int as recipients, count(*) filter (where n.is_read)::int as read,
                  min(n.created_at) as sent_at, max(n.created_at) as last_at
             from public.notifications n where ${ANN}
            group by n.metadata->>'announcement_id', n.title, n.message
            order by min(n.created_at) desc limit 50`);
        const ids = [...new Set(r.rows.map((x) => x.sent_by).filter(Boolean))];
        const names = ids.length ? (await pool.query('select user_id::text as id, display_name from public.hq_staff where user_id = any($1::uuid[])', [ids])).rows : [];
        const nm = Object.fromEntries(names.map((x) => [x.id, x.display_name]));
        return { data: r.rows.map((x) => ({ ...x, sent_by_name: x.sent_by ? nm[x.sent_by] || null : null })) };
      },
    },

    // Removes one send from everyone's notifications, to the trash.
    announce_delete: {
      perm: 'announce',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const where = { sql: `${ANN} and n.metadata->>'announcement_id' = $1`, p: [id] };
          const rows = (await c.query(`select n.* from public.notifications n where ${where.sql} for update`, where.p)).rows;
          if (!rows.length) throw new HttpError(404, 'That announcement is no longer there. Refresh the list.');
          const head = { title: rows[0].title, message: rows[0].message, action_url: rows[0].action_url, recipients: rows.length, read: rows.filter((x) => x.is_read).length };
          await toTrash(c, ctx.staff.userId, 'notifications', id, head, { notifications: rows });
          await c.query(`delete from public.notifications n where ${where.sql}`, where.p);
          await audit({ action: 'announce_delete', entity: 'notifications', entityId: id,
            detail: `Deleted announcement "${String(head.title || '').slice(0, 80)}" from ${rows.length} ${rows.length === 1 ? 'person' : 'people'} to trash`,
            before: head, after: null });
          return { ok: true, message: `Removed from ${rows.length.toLocaleString('en-GB')} ${rows.length === 1 ? 'person' : 'people'}. It is in the trash.` };
        });
      },
    },
  };
}
