// The SQL that restores each kind of trash item. Shared by trash_restore in /api/hq and by
// scripts/trash-restore-tests.ts, which writes the same statements into rolled-back test
// blocks, so the tests prove exactly what HQ runs.
//
// Every statement takes one parameter, $1 = the hq_trash row id, and reads what it needs from
// that row. HQ runs them in one transaction after SET LOCAL session_replication_role = replica
// (a plain statement: Supabase refuses set_config() for it), so no
// trigger fires (no AI moderation, no new rating signals, no notifications, no re-sent support
// emails, no daily review limit) and foreign keys are not checked. So the statements check
// references themselves: rows whose customer, place or review no longer exists are left out,
// and optional links to people who have gone are cleared. Afterwards the ratings and each
// returning reviewer's review_count and verified_reviewer are worked out again.
//
// This file has no imports, so Node can run it directly (type stripping) for the test script.

export type Step = { label: string; sql: string };
// Insertable columns per table (not generated, not identity ALWAYS), read from the database at
// restore time, so a generated column such as reviews.points is left for Postgres to fill.
export type Cols = Record<string, string[]>;
export const TABLES = ['locations', 'reviews', 'rating_signals', 'moderation_log', 'review_likes', 'favorites', 'business_claims', 'location_reports',
  'location_restrictions', 'dog_policy_reviews', 'listing_change_requests', 'mylo_backfill_queue', 'geograph_requeue', 'notifications',
  'support_tickets', 'support_responses', 'support_notes', 'content_pieces', 'hq_outreach'];
export const COLS_SQL = `select table_name, array_agg(column_name::text order by ordinal_position) as cols from information_schema.columns
  where table_schema = 'public' and table_name = any($1) and is_generated = 'NEVER' and not (is_identity = 'YES' and identity_generation = 'ALWAYS')
  group by table_name`;
let C: Cols = {};
const q = (c: string) => '"' + c.replace(/"/g, '""') + '"';
const colList = (table: string) => {
  const cols = C[table];
  if (!cols || !cols.length) throw new Error('No column list for ' + table);
  return { into: '(' + cols.map(q).join(', ') + ')', pick: cols.map((c) => 'r.' + q(c)).join(', ') };
};
export type Plan = { kind: string; checks: Step[]; steps: Step[]; after: Step[]; verify: string };

const T = `public.hq_trash`;
const ROW = `(select row_data from ${T} where id = $1)`;
const REL = (path: string) => `coalesce((select ${path} from ${T} where id = $1), '[]'::jsonb)`;
const COPY = `(select entity_id::uuid from ${T} where id = $1)`;
const KEEP = `(select (related->>'merged_into')::uuid from ${T} where id = $1)`;
const USER = (c: string) => `(r.${c} is null or exists (select 1 from auth.users u where u.id = r.${c}))`;
const LOC = `exists (select 1 from public.locations l where l.id = r.location_id)`;
const REV = `exists (select 1 from public.reviews v where v.id = r.review_id)`;
// Columns added after something went into the trash are missing from its stored copy, and
// jsonb_populate_* would make them null rather than use the column default. These defaults fill
// them in (required columns added since HQ's trash began: replies' direction on 1 Oct, listing
// changes' source on 30 Sep, the place lock columns). A column added later still without one
// here makes the restore fail cleanly, with nothing kept.
const DEFAULTS: Record<string, Record<string, unknown>> = {
  support_responses: { direction: 'out' },
  listing_change_requests: { source: 'hq' },
  locations: { locked_fields: [], category_locked: false, google_verified: false, barkfind_verified: false, google_reviews: [] },
};
const withDefaults = (table: string, json: string) => (DEFAULTS[table] ? `('${JSON.stringify(DEFAULTS[table])}'::jsonb || ${json})` : json);
const withDefaultsEach = (table: string, arr: string) =>
  (DEFAULTS[table] ? `(select coalesce(jsonb_agg('${JSON.stringify(DEFAULTS[table])}'::jsonb || e), '[]'::jsonb) from jsonb_array_elements(${arr}) e)` : arr);
const ins = (table: string, source: string, where: string) => { const c = colList(table);
  return `insert into public.${table} ${c.into} select ${c.pick} from jsonb_populate_recordset(null::public.${table}, ${withDefaultsEach(table, source)}) r where ${where} on conflict do nothing`; };
const insOne = (table: string) => { const c = colList(table);
  return `insert into public.${table} ${c.into} select ${c.pick} from jsonb_populate_record(null::public.${table}, ${withDefaults(table, ROW)}) r`; };
// A deleted place keeps its rows at the top level of related; a merged copy keeps them under
// related.removed (and ids of moved rows under related.moved).
const OWN = (key: string) => `coalesce((select coalesce(related->'removed'->'${key}', related->'${key}') from ${T} where id = $1), '[]'::jsonb)`;
const IDS = (key: string) => `(select jsonb_array_elements_text(${REL(`related->'moved'->'${key}'`)})::uuid)`;
const clearGone = (table: string, col: string, ref: string, scope: string) =>
  `update public.${table} set ${col} = null where ${scope} and ${col} is not null and not exists (select 1 from ${ref} x where x.id = ${table}.${col})`;

const already: Step = { label: 'not restored yet', sql: `select case when restored_at is not null then 'It has already been restored.' end from ${T} where id = $1` };
const idFree = (table: string, what: string): Step => ({
  label: `${what} id free`,
  sql: `select case when exists (select 1 from public.${table} where id = (${ROW}->>'id')::uuid) then 'That ${what} exists again, so it cannot be restored over it.' end`,
});

// Each returning reviewer's count, as trg_update_review_count would have done it.
const recountReviewers = (where: string): Step => ({
  label: 'reviewer counts',
  sql: `update public.profiles p set review_count = x.n, verified_reviewer = (x.n >= 10)
          from (select u.user_id, (select count(*)::int from public.reviews r where r.user_id = u.user_id and r.status = 'approved'
                                     and char_length(btrim(coalesce(r.review_text, ''))) >= 40) as n
                  from (select distinct user_id from public.reviews where ${where} and user_id is not null) u) x
         where p.user_id = x.user_id`,
});

const MOVED = ['reviews', 'favorites', 'rating_signals', 'location_reports', 'business_claims', 'listing_change_requests', 'location_restrictions', 'dog_policy_reviews'];

function placePlan(): Plan {
  const atCopy = `location_id = ${COPY}`;
  return {
    kind: 'locations',
    checks: [
      already,
      idFree('locations', 'place'),
      { label: 'place ID free', sql: `select 'Another place now uses its Google place ID: ' || l.name from public.locations l where l.place_id = ${ROW}->>'place_id' limit 1` },
    ],
    steps: [
      { label: 'place', sql: insOne('locations') },
      { label: 'owner link cleared if gone', sql: clearGone('locations', 'owner_id', 'public.profiles', `id = ${COPY}`) },
      // A merged copy: rows that moved to the kept place move back (only those still there).
      ...MOVED.map((t) => ({ label: `moved back: ${t}`, sql: `update public.${t} set location_id = ${COPY} where location_id = ${KEEP} and id in ${IDS(t)}` })),
      { label: 'moved back: notification links', sql: `update public.notifications set action_url = 'location:' || ${COPY} where action_url = 'location:' || ${KEEP} and id in ${IDS('notification_links')}` },
      // Rows stored with it (a deleted place's rows, or a merged copy's removed duplicates).
      { label: 'reviews', sql: ins('reviews', OWN('reviews'), `${LOC} and ${USER('user_id')}`) },
      { label: 'review dog links cleared if gone', sql: clearGone('reviews', 'dog_profile_id', 'public.dog_profiles', atCopy) },
      { label: 'review rating signals', sql: ins('rating_signals', OWN('review_rating_signals'), `${LOC} and (r.review_id is null or ${REV})`) },
      { label: 'rating signals', sql: ins('rating_signals', OWN('rating_signals'), `${LOC} and (r.review_id is null or ${REV})`) },
      { label: 'moderation log', sql: ins('moderation_log', OWN('moderation_log'), REV) },
      { label: 'review likes', sql: ins('review_likes', OWN('review_likes'), `${REV} and ${USER('user_id')}`) },
      { label: 'favourites', sql: ins('favorites', OWN('favorites'), `${LOC} and ${USER('user_id')}`) },
      { label: 'business claims', sql: ins('business_claims', OWN('business_claims'), `${LOC} and (r.user_id is null or exists (select 1 from public.profiles p where p.id = r.user_id))`) },
      { label: 'place reports', sql: ins('location_reports', OWN('location_reports'), LOC) },
      { label: 'restrictions', sql: ins('location_restrictions', OWN('location_restrictions'), LOC) },
      { label: 'restriction approver cleared if gone', sql: clearGone('location_restrictions', 'approved_by', 'auth.users', atCopy) },
      { label: 'dog policy check', sql: ins('dog_policy_reviews', OWN('dog_policy_reviews'), LOC) },
      { label: 'listing changes', sql: ins('listing_change_requests', OWN('listing_change_requests'), LOC) },
      { label: 'listing change requester cleared if gone', sql: clearGone('listing_change_requests', 'requested_by', 'auth.users', atCopy) },
      { label: 'listing change decider cleared if gone', sql: `update public.listing_change_requests set decided_by = null where ${atCopy} and decided_by is not null and not exists (select 1 from public.hq_staff s where s.user_id = listing_change_requests.decided_by)` },
      { label: 'summary queue', sql: ins('mylo_backfill_queue', OWN('mylo_backfill_queue'), LOC) },
      { label: 'photo queue', sql: ins('geograph_requeue', OWN('geograph_requeue'), LOC) },
      { label: 'report links to reviews', sql: `update public.user_reports u set review_id = (x->>'review_id')::uuid from jsonb_array_elements(${OWN('user_reports_unlinked')}) x
          where u.id = (x->>'id')::uuid and u.review_id is null and exists (select 1 from public.reviews v where v.id = (x->>'review_id')::uuid)` },
      // Lift only the block that this delete or merge added.
      { label: 'place ID unblocked', sql: `delete from public.location_place_id_blocklist b using jsonb_array_elements(${REL('related->\'place_id_blocklist\'')}) x
          where b.place_id = x->>'place_id' and b.created_at = (x->>'created_at')::timestamptz` },
    ],
    after: [
      { label: 'rating (restored place)', sql: `select public.update_barkfind_rating(${COPY})` },
      { label: 'rating (kept place)', sql: `select public.update_barkfind_rating(k) from (select ${KEEP} as k) s where k is not null and exists (select 1 from public.locations where id = k)` },
      recountReviewers(atCopy),
    ],
    verify: `select jsonb_build_object(
        'place_back', exists (select 1 from public.locations where id = ${COPY}),
        'merged_into', ${KEEP},
        'place_id_still_blocked', exists (select 1 from public.location_place_id_blocklist b where b.place_id = ${ROW}->>'place_id'),
        'at_place', jsonb_build_object('reviews', (select count(*) from public.reviews where ${atCopy}), 'rating_signals', (select count(*) from public.rating_signals where ${atCopy}),
          'favourites', (select count(*) from public.favorites where ${atCopy}), 'photo_queue', (select count(*) from public.geograph_requeue where ${atCopy})),
        'rating', (select barkfind_rating from public.locations where id = ${COPY}),
        'kept_place_rating_signals', (select count(*) from public.rating_signals where location_id = ${KEEP}))`,
  };
}

function ticketPlan(): Plan {
  const scope = `id = (${ROW}->>'id')::uuid`;
  return {
    kind: 'support_tickets',
    checks: [already, idFree('support_tickets', 'ticket')],
    steps: [
      { label: 'ticket', sql: insOne('support_tickets') },
      { label: 'customer link cleared if gone', sql: clearGone('support_tickets', 'user_id', 'auth.users', scope) },
      { label: 'assignee cleared if gone', sql: `update public.support_tickets set assigned_to = null where ${scope} and assigned_to is not null and not exists (select 1 from public.hq_staff s where s.user_id = support_tickets.assigned_to)` },
      { label: 'replies', sql: ins('support_responses', REL(`related->'support_responses'`), `exists (select 1 from public.support_tickets t where t.id = r.ticket_id)`) },
      { label: 'notes', sql: ins('support_notes', REL(`related->'support_notes'`), `exists (select 1 from public.support_tickets t where t.id = r.ticket_id)`) },
    ],
    after: [],
    verify: `select jsonb_build_object('ticket_back', exists (select 1 from public.support_tickets where ${scope}),
        'replies', (select count(*) from public.support_responses where ticket_id = (${ROW}->>'id')::uuid),
        'notes', (select count(*) from public.support_notes where ticket_id = (${ROW}->>'id')::uuid))`,
  };
}

function contentPlan(): Plan {
  const scope = `id = (${ROW}->>'id')::uuid`;
  return {
    kind: 'content_pieces',
    checks: [already, idFree('content_pieces', 'content piece')],
    steps: [
      { label: 'content piece', sql: insOne('content_pieces') },
      { label: 'approver cleared if gone', sql: clearGone('content_pieces', 'approved_by', 'auth.users', scope) },
    ],
    after: [],
    verify: `select jsonb_build_object('content_back', exists (select 1 from public.content_pieces where ${scope}), 'status', (select status from public.content_pieces where ${scope}))`,
  };
}

function outreachPlan(): Plan {
  return {
    kind: 'hq_outreach',
    checks: [already, idFree('hq_outreach', 'outreach contact')],
    steps: [{ label: 'outreach contact', sql: insOne('hq_outreach') }],
    after: [],
    verify: `select jsonb_build_object('contact_back', exists (select 1 from public.hq_outreach where id = (${ROW}->>'id')::uuid))`,
  };
}

function announcementPlan(): Plan {
  return {
    kind: 'notifications',
    checks: [already],
    steps: [{ label: 'notifications', sql: ins('notifications', REL(`related->'notifications'`), USER('user_id')) }],
    after: [],
    verify: `select jsonb_build_object('notifications_back', (select count(*) from public.notifications n where n.id in (select (x->>'id')::uuid from jsonb_array_elements(${REL(`related->'notifications'`)}) x)),
        'stored', jsonb_array_length(${REL(`related->'notifications'`)}))`,
  };
}

const MAKERS: Record<string, () => Plan> = {
  locations: placePlan, support_tickets: ticketPlan, content_pieces: contentPlan, hq_outreach: outreachPlan, notifications: announcementPlan,
};
export const RESTORABLE = Object.keys(MAKERS);
export function planFor(entity: string, cols: Cols): Plan | null { const make = MAKERS[entity]; if (!make) return null; C = cols; try { return make(); } finally { C = {}; } }
export const markRestored = `update ${T} set restored_at = now(), restored_by = $2 where id = $1 and restored_at is null`;
