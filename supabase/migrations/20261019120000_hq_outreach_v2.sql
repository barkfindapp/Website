-- hq_outreach_v2: outreach in HQ (branch hq-outreach), 19 October 2026.
-- Written by the HQ chat; NOT applied. Josh runs it in the SQL Editor after reading it.
-- Everything is additive: every existing column, row and log entry is kept. RLS stays on
-- with no policies on every table here, so only HQ's server connection can read or write.

begin;

-- 1. hq_outreach: two more kinds, two more statuses, and the new columns.
alter table public.hq_outreach drop constraint hq_outreach_kind_check;
alter table public.hq_outreach add constraint hq_outreach_kind_check
  check (kind = any (array['creator', 'creator_prospect', 'venue', 'press', 'partner', 'community', 'other']));

-- 'shared': the venue or person has posted, shared or displayed BarkFind.
alter table public.hq_outreach drop constraint hq_outreach_status_check;
alter table public.hq_outreach add constraint hq_outreach_status_check
  check (status = any (array['to_contact', 'contacted', 'replied', 'warm', 'agreed', 'live', 'shared', 'declined', 'parked']));

alter table public.hq_outreach
  add column location_id uuid references public.locations(id) on delete set null,
  add column creator_id  uuid references public.creators(id) on delete set null,
  add column area        text,
  add column owner       uuid references public.hq_staff(user_id) on delete set null,
  add column tags        text[] not null default '{}',
  add column source      text not null default 'hq' check (source in ('hq', 'import', 'suggested')),
  add column handles     jsonb not null default '{}'::jsonb;

-- One venue is never worked twice.
create unique index hq_outreach_location_unique on public.hq_outreach (location_id) where location_id is not null;
create index hq_outreach_status_idx on public.hq_outreach (status);
create index hq_outreach_follow_up_idx on public.hq_outreach (next_follow_up) where next_follow_up is not null;

comment on column public.hq_outreach.location_id is 'The BarkFind place this contact is about (venues). Unique, so a venue is worked once.';
comment on column public.hq_outreach.creator_id is 'Set when a prospect joins the creator programme (public.creators).';
comment on column public.hq_outreach.area is 'Free text patch for filtering, for example Weston-super-Mare or BS23.';
comment on column public.hq_outreach.owner is 'The member of staff who owns the relationship (hq_staff.user_id).';
comment on column public.hq_outreach.source is 'hq (added by hand), import (Import from places) or suggested.';
comment on column public.hq_outreach.handles is 'Social handles, same shape as creators.handles, for example {"instagram": "@x"}. The old handle column stays.';

-- 2. hq_outreach_log: how and which way, the full text when HQ sent it, and who.
-- Existing rows keep their note and get nulls.
alter table public.hq_outreach_log
  add column channel   text check (channel in ('email', 'instagram_dm', 'phone', 'in_person', 'other')),
  add column direction text check (direction in ('out', 'in')),
  add column body      text,
  add column "by"      uuid references public.hq_staff(user_id) on delete set null;
create index hq_outreach_log_contact_idx on public.hq_outreach_log (outreach_id, at desc);

-- 3. Nothing may ever be sent to an address in here.
create table public.outreach_suppression (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  reason     text not null check (reason in ('unsubscribed', 'bounced', 'complained', 'manual')),
  created_at timestamptz not null default now()
);
alter table public.outreach_suppression enable row level security;
revoke all on public.outreach_suppression from anon, authenticated;
comment on table public.outreach_suppression is 'Outreach email addresses that must never be emailed again. Lower case. RLS on, no policies.';

-- 4. Backfill: link venue rows to their place only where the match is certain.
-- Name alone was not enough: The New Inn, The Old Inn and The Ship Inn each match many
-- places. The Old Inn is linked to the Weston-super-Mare match (Hutton) because its
-- BarkFind rating (4.4) and review count (1) agree with the outreach plan. The New Inn
-- (Kewstoke: 3.5, 0 reviews; the plan said 4.6, 1 review) and The Ship Inn (Uphill: now
-- 3.8 with 2 reviews; the plan said 3.7, 1 review) are left unlinked for Josh to check.
update public.hq_outreach o set location_id = v.loc
  from (values
    ('Revo Kitchen',         'cb62c7b0-211d-4d3e-b5e3-51c862e93df0'::uuid),
    ('Stones Cafe',          '3e73bc1d-3582-4a54-a5a7-1df9bc6b9a48'::uuid),
    ('The Blue Flame Inn',   '92522a63-8d71-4465-ac50-4f10cee248b2'::uuid),
    ('The Boathouse Uphill', '0382ae78-27fe-4c42-86c8-1edb0a585791'::uuid),
    ('The Old Inn',          'cea4ac80-8ba2-4623-8437-e8ad1aa827bc'::uuid)
  ) as v(name, loc)
 where o.kind = 'venue' and o.name = v.name and o.location_id is null
   and exists (select 1 from public.locations l where l.id = v.loc);

-- 5. Retire the outreach parts of hq_action. HQ now writes outreach through
-- api/_lib/hq-outreach.ts with fixed SQL. Every other branch below is unchanged, word for word.
CREATE OR REPLACE FUNCTION public.hq_action(_action text, _args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int := 0; _id uuid; _status text; _out jsonb;
begin
  if _action = 'approve_review' or _action = 'reject_review' then
    _id := (_args->>'id')::uuid;
    update reviews set status = (case when _action = 'approve_review' then 'approved' else 'rejected' end)::review_status,
           moderation_source = 'admin', moderated_at = now()
     where id = _id and status = 'pending';
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('ok', false, 'message', 'That review is no longer pending. Refresh to see its current state.'); end if;
    _out := jsonb_build_object('ok', true, 'message', case when _action = 'approve_review' then 'Approved. It is live and the reviewer gets a push.' else 'Rejected. The reviewer sees it in their in-app notifications only.' end);

  elsif _action = 'reply_ticket' then
    _id := (_args->>'ticket_id')::uuid;
    if coalesce(btrim(_args->>'body'),'') = '' then return jsonb_build_object('ok', false, 'message', 'The reply is empty.'); end if;
    if not exists (select 1 from support_tickets where id = _id) then return jsonb_build_object('ok', false, 'message', 'Ticket not found.'); end if;
    insert into support_responses (ticket_id, body, status) values (_id, btrim(_args->>'body'), 'queued');
    update support_tickets set status = case when coalesce((_args->>'resolve')::boolean, false) then 'resolved' else 'in_progress' end, updated_at = now() where id = _id;
    _out := jsonb_build_object('ok', true, 'message', 'Reply queued. send-support-reply emails it from support@barkfind.com within a few seconds.');

  elsif _action = 'set_ticket_status' then
    _id := (_args->>'ticket_id')::uuid; _status := _args->>'status';
    if _status not in ('open','in_progress','resolved') then return jsonb_build_object('ok', false, 'message', 'Unknown status.'); end if;
    update support_tickets set status = _status, updated_at = now() where id = _id;
    get diagnostics n = row_count;
    _out := jsonb_build_object('ok', n = 1, 'message', case when n = 1 then 'Ticket marked ' || replace(_status,'_',' ') || '.' else 'Ticket not found.' end);

  elsif _action = 'note_ticket' then
    _id := (_args->>'ticket_id')::uuid;
    insert into support_notes (ticket_id, body) values (_id, btrim(_args->>'body'));
    _out := jsonb_build_object('ok', true, 'message', 'Note saved. Only you see notes.');

  elsif _action = 'user_report' then
    _id := (_args->>'id')::uuid; _status := _args->>'status';
    if _status not in ('actioned','dismissed') then return jsonb_build_object('ok', false, 'message', 'Unknown status.'); end if;
    update user_reports set status = _status, handled_at = now() where id = _id and status = 'pending';
    get diagnostics n = row_count;
    _out := jsonb_build_object('ok', n = 1, 'message', case when n = 1 then 'Report ' || _status || '. Banning, if needed, is done in the admin console.' else 'That report was already handled.' end);

  elsif _action = 'location_report' then
    _id := (_args->>'id')::uuid; _status := _args->>'status';
    if _status not in ('actioned','dismissed') then return jsonb_build_object('ok', false, 'message', 'Unknown status.'); end if;
    update location_reports set status = _status where id = _id and status = 'open';
    get diagnostics n = row_count;
    _out := jsonb_build_object('ok', n = 1, 'message', case when n = 1 then 'Place report ' || _status || '.' else 'That report was already handled.' end);

  elsif _action = 'renewal_done' then
    _id := (_args->>'id')::uuid;
    update hq_renewals set
      due_date = case when recurs = 'yearly' and due_date is not null then (due_date + interval '1 year')::date else due_date end,
      status = case when recurs = 'yearly' and due_date is not null then 'active' else 'done' end,
      updated_at = now()
     where id = _id;
    get diagnostics n = row_count;
    _out := jsonb_build_object('ok', n = 1, 'message', case when n = 1 then 'Marked done.' || coalesce(' Next due ' || (select to_char(due_date, 'DD Mon YYYY') from hq_renewals where id = _id and status = 'active') || '.', '') else 'Not found.' end);

  elsif _action = 'renewal_save' then
    _id := nullif(_args->>'id','')::uuid;
    if _id is null then
      if coalesce(btrim(_args->>'item'),'') = '' then return jsonb_build_object('ok', false, 'message', 'Name the renewal first.'); end if;
      insert into hq_renewals (item, category, due_date, recurs, url, notes)
      values (btrim(_args->>'item'), coalesce(nullif(_args->>'category',''),'other'), nullif(_args->>'due_date','')::date, coalesce(nullif(_args->>'recurs',''),'none'), nullif(_args->>'url',''), nullif(_args->>'notes',''))
      returning id into _id;
    else
      update hq_renewals set
        due_date = case when _args ? 'due_date' then nullif(_args->>'due_date','')::date else due_date end,
        notes = case when _args ? 'notes' then nullif(_args->>'notes','') else notes end,
        recurs = coalesce(nullif(_args->>'recurs',''), recurs),
        status = 'active', updated_at = now()
       where id = _id;
    end if;
    _out := jsonb_build_object('ok', true, 'message', 'Saved.', 'id', _id);

  else
    return jsonb_build_object('ok', false, 'message', 'Unknown action: ' || coalesce(_action,'none'));
  end if;

  insert into admin_audit (actor, action, entity, entity_id, detail)
  values ('hq', _action, split_part(_action,'_',1), coalesce(_id::text, _args->>'id'), left(_args::text, 1000));
  return _out;
end $function$;

-- hq_queue() is deliberately left as it is: see the report for who reads it.

commit;
