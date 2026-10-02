# HQ trash: retention and account deletion

For Claude in the project to apply. HQ itself never changes the schema. Written 2 Oct 2026, against the live schema on that day.

The trash (`public.hq_trash`) keeps a full copy of everything HQ deletes or merges away, so it can be restored. There is no "delete forever" button. Instead, two database jobs make sure the trash does not keep customer data indefinitely:

- (a) everything older than 90 days is purged automatically, every night;
- (b) when a customer's account is deleted, their rows are removed from the trash straight away.

Both are plain SQL below. Section C is a rolled-back test of (b).

---

## (a) Purge trash items older than 90 days

pg_cron is already in use (14 jobs, for example `purge-stale-anonymous-users` at 03:20). Add one more at 03:40, after that one:

```sql
select cron.schedule(
  'hq-trash-purge-90d',
  '40 3 * * *',
  $$ delete from public.hq_trash where deleted_at < now() - interval '90 days' $$
);
```

Notes:

- Restored items are purged too, on the same 90-day clock from when they were deleted. The restored row is only a record by then; the live data is back in its own table.
- Purging does not touch `location_place_id_blocklist`. A place deleted or merged away stays blocked from being re-imported after its trash item has gone. This is intended: the block is what stops the importer recreating duplicates.
- HQ's Trash page already shows "N days left" on each waiting item, counting down from 90.
- `admin_audit` is not covered by this job. Its `before` and `after` columns can also hold customer data (for example a review's text when it was edited). That needs its own retention decision; it is out of scope here.

To check it later: `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'hq-trash-purge-90d') order by start_time desc limit 5;`

---

## (b) Remove a customer's rows from the trash when their account is deleted

### Where customer data sits in the trash

| Trash item (`entity`) | Customer data | What happens on account deletion |
|---|---|---|
| `support_tickets` | `row_data.user_id`, `row_data.email`, name, message, plus `related.support_responses` and `related.support_notes` | The whole trash row is deleted (matched on user id, or on email for tickets sent before sign-up) |
| `notifications` (announcements) | `related.notifications[]`, one element per recipient, with `user_id` | That person's elements are stripped from the array |
| `locations` (deleted place) | arrays at the top of `related` | That person's elements are stripped (list below) |
| `locations` (merged copy) | the same arrays, under `related.removed` | The same, under `removed` |
| `locations` (either) | `row_data.owner_id` | Set to null if it is them |
| `content_pieces`, `hq_outreach` | No customer accounts (staff and outreach contacts only) | Nothing |

Within a place's arrays, these are stripped:

- `reviews` where `user_id` is them, and everything hanging off those reviews: `review_rating_signals`, `moderation_log`, `review_likes` and `user_reports_unlinked` with a matching `review_id`;
- `favorites`, `review_likes`, `location_reports`, `business_claims` where `user_id` is them;
- `business_claims` where `claimant_email` is their email;
- `listing_change_requests` where `requested_by` is them or `requester_email` is their email.

Arrays under `related.moved` hold only ids of rows that were moved to the kept place. Those rows are live data, so the normal account deletion cascades already remove them; there is nothing to strip there. A later restore skips anything that has gone.

### The trigger

An AFTER DELETE trigger on `auth.users` covers every way an account goes: the delete-account edge function, the nightly `purge_stale_anonymous_users`, and deletes from the Supabase dashboard. `auth.users` already has two triggers of ours (`on_auth_user_created`, `on_auth_user_created_welcome`), so this follows the same pattern.

```sql
-- Drops elements of a jsonb array whose field matches one of the values. Null-safe.
create or replace function public.hq_trash_strip(arr jsonb, field text, vals text[])
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
    from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) e
   where not coalesce(lower(e->>field) = any (select lower(v) from unnest(vals) v), false)
$$;

-- Removes one customer's data from hq_trash. Safe to run more than once.
create or replace function public.hq_trash_forget_user(p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record; i int; base text[]; rel jsonb; rev text[]; me text[] := array[p_user::text];
  mail text[] := case when nullif(trim(p_email), '') is null then array[]::text[] else array[trim(p_email)] end;
begin
  -- 1. Support tickets: the whole item goes.
  delete from hq_trash
   where entity = 'support_tickets'
     and (row_data->>'user_id' = p_user::text
          or (cardinality(mail) > 0 and lower(row_data->>'email') = lower(mail[1])));

  -- 2. Announcements: drop this person's notification.
  update hq_trash
     set related = jsonb_set(related, '{notifications}', hq_trash_strip(related->'notifications', 'user_id', me))
   where entity = 'notifications'
     and related->'notifications' @> jsonb_build_array(jsonb_build_object('user_id', p_user));

  -- 3. Places and merged copies: the arrays sit at the top of related (deleted place)
  --    or under related.removed (merged copy). Only rows that mention the person are touched.
  for t in
    select id, row_data, related from hq_trash
     where entity = 'locations'
       and (row_data->>'owner_id' = p_user::text
            or related::text like '%' || p_user::text || '%'
            or (cardinality(mail) > 0 and lower(related::text) like '%' || lower(mail[1]) || '%'))
     for update
  loop
    rel := t.related;
    for i in 0..1 loop
      base := case i when 0 then array[]::text[] else array['removed'] end;
      if jsonb_typeof(rel #> base) is distinct from 'object' then continue; end if;
      -- The person's reviews, and everything hanging off them.
      select coalesce(array_agg(e->>'id'), array[]::text[]) into rev
        from jsonb_array_elements(coalesce(rel #> (base || 'reviews'::text), '[]'::jsonb)) e
       where e->>'user_id' = p_user::text;
      if rel #> (base || 'reviews'::text) is not null then
        rel := jsonb_set(rel, base || 'reviews'::text, hq_trash_strip(rel #> (base || 'reviews'::text), 'user_id', me)); end if;
      if cardinality(rev) > 0 then
        if rel #> (base || 'review_rating_signals'::text) is not null then rel := jsonb_set(rel, base || 'review_rating_signals'::text, hq_trash_strip(rel #> (base || 'review_rating_signals'::text), 'review_id', rev)); end if;
        if rel #> (base || 'moderation_log'::text) is not null then rel := jsonb_set(rel, base || 'moderation_log'::text, hq_trash_strip(rel #> (base || 'moderation_log'::text), 'review_id', rev)); end if;
        if rel #> (base || 'review_likes'::text) is not null then rel := jsonb_set(rel, base || 'review_likes'::text, hq_trash_strip(rel #> (base || 'review_likes'::text), 'review_id', rev)); end if;
        if rel #> (base || 'user_reports_unlinked'::text) is not null then rel := jsonb_set(rel, base || 'user_reports_unlinked'::text, hq_trash_strip(rel #> (base || 'user_reports_unlinked'::text), 'review_id', rev)); end if;
      end if;
      -- Their own rows.
      if rel #> (base || 'favorites'::text) is not null then rel := jsonb_set(rel, base || 'favorites'::text, hq_trash_strip(rel #> (base || 'favorites'::text), 'user_id', me)); end if;
      if rel #> (base || 'review_likes'::text) is not null then rel := jsonb_set(rel, base || 'review_likes'::text, hq_trash_strip(rel #> (base || 'review_likes'::text), 'user_id', me)); end if;
      if rel #> (base || 'location_reports'::text) is not null then rel := jsonb_set(rel, base || 'location_reports'::text, hq_trash_strip(rel #> (base || 'location_reports'::text), 'user_id', me)); end if;
      if rel #> (base || 'business_claims'::text) is not null then
        rel := jsonb_set(rel, base || 'business_claims'::text, hq_trash_strip(hq_trash_strip(rel #> (base || 'business_claims'::text), 'user_id', me), 'claimant_email', mail)); end if;
      if rel #> (base || 'listing_change_requests'::text) is not null then
        rel := jsonb_set(rel, base || 'listing_change_requests'::text, hq_trash_strip(hq_trash_strip(rel #> (base || 'listing_change_requests'::text), 'requested_by', me), 'requester_email', mail)); end if;
    end loop;
    update hq_trash
       set related = rel,
           row_data = case when row_data->>'owner_id' = p_user::text then jsonb_set(row_data, '{owner_id}', 'null'::jsonb) else row_data end
     where id = t.id;
  end loop;
end $$;

revoke all on function public.hq_trash_forget_user(uuid, text) from public, anon, authenticated;

create or replace function public.hq_trash_on_user_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.hq_trash_forget_user(old.id, old.email);
  return old;
end $$;

drop trigger if exists on_auth_user_deleted_hq_trash on auth.users;
create trigger on_auth_user_deleted_hq_trash
  after delete on auth.users
  for each row execute function public.hq_trash_on_user_deleted();
```

Notes:

- The trigger is AFTER DELETE, so it never blocks or slows the deletion itself beyond one short scan of `hq_trash` (a handful of rows, and at most 90 days' worth).
- Matching on email for tickets and claims catches things the person sent before they had an account, or while signed out.
- Anonymous users purged at night have no tickets or reviews in practice, so for them this does nothing.
- One-off catch-up for accounts already deleted (none of today's 10 trash items belong to a deleted account, but this is safe to run):

```sql
select public.hq_trash_forget_user((r->>'user_id')::uuid, r->>'email')
  from public.hq_trash t, lateral (select t.row_data as r) x
 where t.entity = 'support_tickets' and r->>'user_id' is not null
   and not exists (select 1 from auth.users u where u.id = (r->>'user_id')::uuid);
```

---

## C. Rolled-back test of (b)

None of today's 10 trash items holds a customer account's data: the trashed ticket "HQ test" came from an email with no account behind it, and the six Belton House copies hold no reviews, favourites or claims. So the test builds its own: a made-up customer with a review (plus a like, a rating signal and a moderation entry on it), a favourite, a place report, a claim and a listing change, once in a deleted place and once in a merged copy (under `removed`). It also checks the ticket match by email, the real announcement, and that someone else's rows stay. Then everything is rolled back.

Run it after the functions in (b) exist, or paste the two `create or replace function` statements in straight after `begin;` to test without keeping anything (that is how it was run on 2 Oct).

```sql
begin;
do $test$
declare
  me uuid := gen_random_uuid(); other uuid := gen_random_uuid(); rv uuid := gen_random_uuid(); orv uuid := gen_random_uuid();
  tk uuid := '54551f19-731b-4f75-869a-05b7f1c30ab1';   -- trashed ticket "HQ test"
  ann uuid := '732558a6-3230-44cd-aaf0-eb99ba4aaed4';  -- announcement "Just me (test)"
  arrays jsonb; d uuid; m uuid; u_ann uuid; out jsonb := '{}'::jsonb;
  cnt text := 'select jsonb_build_object(''reviews'', jsonb_array_length(a->''reviews''), ''review_likes'', jsonb_array_length(a->''review_likes''),
                 ''review_rating_signals'', jsonb_array_length(a->''review_rating_signals''), ''moderation_log'', jsonb_array_length(a->''moderation_log''),
                 ''favorites'', jsonb_array_length(a->''favorites''), ''location_reports'', jsonb_array_length(a->''location_reports''),
                 ''business_claims'', jsonb_array_length(a->''business_claims''), ''listing_change_requests'', jsonb_array_length(a->''listing_change_requests''))
               from (select coalesce(related->''removed'', related) a from public.hq_trash where id = $1) x';
  v jsonb;
begin
  -- One of each for the made-up customer, and one review, like and favourite for someone else.
  arrays := jsonb_build_object(
    'reviews', jsonb_build_array(jsonb_build_object('id', rv, 'user_id', me), jsonb_build_object('id', orv, 'user_id', other)),
    'review_likes', jsonb_build_array(jsonb_build_object('review_id', rv, 'user_id', other), jsonb_build_object('review_id', orv, 'user_id', me), jsonb_build_object('review_id', orv, 'user_id', other)),
    'review_rating_signals', jsonb_build_array(jsonb_build_object('review_id', rv), jsonb_build_object('review_id', orv)),
    'moderation_log', jsonb_build_array(jsonb_build_object('review_id', rv)),
    'favorites', jsonb_build_array(jsonb_build_object('user_id', me), jsonb_build_object('user_id', other)),
    'location_reports', jsonb_build_array(jsonb_build_object('user_id', me)),
    'business_claims', jsonb_build_array(jsonb_build_object('user_id', null, 'claimant_email', 'Test.Forget@example.com')),
    'listing_change_requests', jsonb_build_array(jsonb_build_object('requested_by', me)));
  insert into public.hq_trash (entity, entity_id, row_data, related) values
    ('locations', gen_random_uuid()::text, jsonb_build_object('name', 'Forget test (deleted)', 'owner_id', me), arrays || '{"place_id_blocklist": []}') returning id into d;
  insert into public.hq_trash (entity, entity_id, row_data, related) values
    ('locations', gen_random_uuid()::text, jsonb_build_object('name', 'Forget test (merged)'), jsonb_build_object('merged_into', gen_random_uuid(), 'moved', '{}'::jsonb, 'removed', arrays)) returning id into m;

  execute cnt into v using d; out := out || jsonb_build_object('before', v);

  perform public.hq_trash_forget_user(me, 'test.forget@example.com');
  execute cnt into v using d; out := out || jsonb_build_object('deleted place after', v,
    'owner cleared', (select row_data->'owner_id' = 'null'::jsonb from public.hq_trash where id = d));
  execute cnt into v using m; out := out || jsonb_build_object('merged copy after', v);

  -- The ticket by email (it has no account), then the real announcement's one recipient.
  perform public.hq_trash_forget_user(gen_random_uuid(), (select row_data->>'email' from public.hq_trash where id = tk));
  out := out || jsonb_build_object('ticket item gone', not exists (select 1 from public.hq_trash where id = tk));
  select (related->'notifications'->0->>'user_id')::uuid into u_ann from public.hq_trash where id = ann;
  perform public.hq_trash_forget_user(u_ann, null);
  out := out || jsonb_build_object('announcement recipients left', (select jsonb_array_length(related->'notifications') from public.hq_trash where id = ann),
    'staff-only items untouched', (select count(*) from public.hq_trash where entity in ('content_pieces', 'hq_outreach')));
  raise exception 'RESULT (rolled back): %', out;
end $test$;
rollback;
```

Expected, both for the deleted place and the merged copy: reviews 2 to 1 (the other person's stays), review_likes 3 to 1 (the like on their review and their own like on the other review go; the other person's like on the other review stays), review_rating_signals 2 to 1, moderation_log 1 to 0, favorites 2 to 1, location_reports 1 to 0, business_claims 1 to 0 (matched by email, any letter case), listing_change_requests 1 to 0, owner cleared. Ticket item gone, announcement recipients left 0, staff-only items 2.

Result on 2 Oct 2026 (rolled back, nothing kept): exactly as expected, for both the deleted place and the merged copy.

Note: tickets from people who never had an account (like "HQ test") are not tied to any account deletion, so for those the 90-day purge in (a) is what removes them.
