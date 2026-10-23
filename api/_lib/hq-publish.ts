// Publish to website: approved Content pieces only reach barkfind.com when the site rebuilds.
// site_publish POSTs to a Vercel deploy hook for main (env VERCEL_DEPLOY_HOOK_URL, Production
// only). The hook URL is read here and nowhere else: never sent to the browser, written to the
// audit or logged. One publish per 10 minutes; the last publish is the latest site_publish
// audit row. Owners only; every /api/hq op already needs the second sign-in step (aal2).
import type { Pool } from 'pg';
import { HttpError, only, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';

const GAP_MIN = 10;
const ukTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

export async function publishStatus(pool: Pool) {
  const last = (await pool.query(
    `select a.created_at as at, coalesce(s.display_name, s.email) as by_name from public.admin_audit a
       left join public.hq_staff s on s.user_id = a.actor_user_id
      where a.action = 'site_publish' order by a.created_at desc limit 1`)).rows[0] || null;
  const counts = (await pool.query(
    `select count(*) filter (where status = 'approved')::int as approved,
            count(*) filter (where status = 'approved' and ($1::timestamptz is null or approved_at > $1))::int as approved_since
       from public.content_pieces`, [last?.at ?? null])).rows[0];
  return { last_published_at: last?.at ?? null, last_published_by: last?.by_name ?? null, approved: counts.approved, approved_since: counts.approved_since };
}

export function publishOps(pool: Pool): Record<string, Op> {
  return {
    site_publish_status: {
      perm: 'content',
      run: async (a, ctx) => {
        only(a, []);
        return { data: { ...(await publishStatus(pool)), can_publish: ctx.staff.level === 'owner', configured: !!process.env.VERCEL_DEPLOY_HOOK_URL } };
      },
    },
    site_publish: {
      perm: 'content',
      run: async (a, ctx) => {
        only(a, []);
        if (ctx.staff.level !== 'owner') throw new HttpError(403, 'Only an owner can publish the website.');
        const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
        if (!hook) throw new HttpError(503, "Publishing isn't set up yet.");
        const st = await publishStatus(pool);
        if (st.last_published_at) {
          const next = new Date(new Date(st.last_published_at).getTime() + GAP_MIN * 60e3);
          if (next.getTime() > Date.now()) throw new HttpError(429, `The site was published at ${ukTime(new Date(st.last_published_at))}. The next publish is allowed from ${ukTime(next)}.`);
        }
        let status = 0;
        try { status = (await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(15000) })).status; } catch { status = 0; }
        if (status < 200 || status >= 300) throw new HttpError(502, status ? `Vercel did not start the rebuild (status ${status}). Nothing was published.` : 'Vercel did not answer. Nothing was published.');
        return writeTx(pool, ctx.staff.userId, async (_c, audit) => {
          await audit({ action: 'site_publish', entity: 'content_pieces',
            detail: `Published barkfind.com with ${st.approved} approved content piece${st.approved === 1 ? '' : 's'} (${st.approved_since} new since the last publish)`,
            before: { last_published_at: st.last_published_at }, after: { approved: st.approved, approved_since_last: st.approved_since, vercel_status: status } });
          return { ok: true, message: 'Started. The site updates in about 2 minutes.' };
        });
      },
    },
  };
}
