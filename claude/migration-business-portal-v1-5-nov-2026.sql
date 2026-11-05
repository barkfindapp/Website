-- Business portal v1: owners claim a venue, manage its listing, and reply to reviews.
-- 5 November 2026. For the project chat to apply in the Supabase SQL Editor after Josh has read it.
-- Nothing here is applied by the website repo. Read it top to bottom; the steps are small.
--
-- Checked against the live database on 5 Nov before writing:
--  - business_claims.status already has a CHECK ('pending','verified','rejected'). We keep 'verified';
--    the brief's "approved" was loose wording, so this migration does NOT touch that constraint.
--  - business_claims.user_id references profiles(id). listing_change_requests.decided_by references
--    hq_staff(user_id). New staff/owner references below follow the same targets.
--  - hq_alerts.kind is free text (no CHECK), so the new alert kinds 'owner_change_request' and
--    'review_reply' need no schema change. They are passed by the application code in later tasks.
--    hq_alerts.severity must stay one of 'crit','warn','info'.
--  - review_replies_public mirrors the existing creators_public view: a plain view (not
--    security_invoker) with SELECT granted to anon and authenticated, so the app can read it while
--    the base table stays service-role only.
--
-- RLS note: the new tables have RLS enabled with no policies. Only the service role can read or
-- write them, which bypasses RLS. All portal access goes through /api/business, as the brief requires.
-- No existing RLS policy is created or changed here.

begin;

-- 1. location_owners: who may manage a venue. A venue can have more than one manager, and one
--    person can run several venues. A row with revoked_at set is kept for the audit trail.
create table if not exists public.location_owners (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references public.locations (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           text not null default 'owner' check (role in ('owner', 'manager')),
  granted_by     uuid references public.hq_staff (user_id) on delete set null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) <= 1000)
);

-- One active (not revoked) row per person per venue. Revoked rows do not block a fresh grant.
create unique index if not exists location_owners_active_uniq
  on public.location_owners (location_id, user_id) where revoked_at is null;
create index if not exists location_owners_user_idx on public.location_owners (user_id);
create index if not exists location_owners_location_idx on public.location_owners (location_id);

alter table public.location_owners enable row level security;

-- 2. business_claims: extra fields for web claims and for recording the decision.
--    status stays as it is ('pending','verified','rejected'); the existing CHECK is left in place.
alter table public.business_claims
  add column if not exists role                   text,
  add column if not exists work_email_matches_site boolean,
  add column if not exists verification_method    text
    check (verification_method is null
           or verification_method in ('work_email', 'phone_call', 'document', 'other')),
  add column if not exists decided_by             uuid references public.hq_staff (user_id) on delete set null,
  add column if not exists decided_at             timestamptz,
  add column if not exists decline_reason         text
    check (decline_reason is null or char_length(decline_reason) <= 1000),
  add column if not exists source                 text not null default 'app'
    check (source in ('app', 'web'));

-- Existing rows keep source = 'app' (the default), which is right: they came from the app.
create index if not exists business_claims_user_idx on public.business_claims (user_id);
create index if not exists business_claims_location_idx on public.business_claims (location_id);

-- 3. listing_change_requests: owners become a source, and photos can wait for approval.
alter table public.listing_change_requests
  add column if not exists photo_paths text[]
    check (photo_paths is null or array_length(photo_paths, 1) <= 6);

-- Add 'owner' to the source whitelist (was 'hq','app','website','email').
alter table public.listing_change_requests drop constraint if exists listing_change_requests_source_check;
alter table public.listing_change_requests
  add constraint listing_change_requests_source_check
  check (source in ('hq', 'app', 'website', 'email', 'owner'));

-- Beyond the brief's literal Task 1 list, but needed by Task 4 (the owner edit form includes
-- description and amenities, and both exist as real columns on locations). Without this, an owner
-- edit to either field would be rejected by the changes whitelist. Cut this block if you would
-- rather it lived in a separate Task 4 migration.
alter table public.listing_change_requests drop constraint if exists listing_change_requests_changes_check;
alter table public.listing_change_requests
  add constraint listing_change_requests_changes_check
  check (
    jsonb_typeof(changes) = 'object'
    and changes <> '{}'::jsonb
    and (changes - array[
      'name', 'address', 'opening_hours', 'dog_policy', 'dog_policy_note',
      'website', 'image_url', 'closed', 'description', 'amenities'
    ]) = '{}'::jsonb
  );

-- 4. review_replies: a venue's reply to a review, moderated the same way reviews are.
--    One reply per review. updated_at is set by the application on write, as listing_change_requests does.
create table if not exists public.review_replies (
  id             uuid primary key default gen_random_uuid(),
  review_id      uuid not null unique references public.reviews (id) on delete cascade,
  location_id    uuid not null references public.locations (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  body           text not null check (char_length(body) between 1 and 1000),
  status         text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'removed')),
  moderation     jsonb,
  decided_by     uuid references public.hq_staff (user_id) on delete set null,
  decided_at     timestamptz,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists review_replies_location_idx on public.review_replies (location_id);
create index if not exists review_replies_status_idx on public.review_replies (status);

alter table public.review_replies enable row level security;

-- The app reads approved replies through this view. Plain view (runs as owner, so it is not blocked
-- by the base table's RLS), exactly like creators_public.
drop view if exists public.review_replies_public;
create view public.review_replies_public as
  select rr.review_id,
         rr.body,
         rr.decided_at as approved_at,
         l.name        as venue_name
    from public.review_replies rr
    join public.locations l on l.id = rr.location_id
   where rr.status = 'approved';

grant select on public.review_replies_public to anon, authenticated;

-- 5. Storage: a private bucket for owner photos waiting for approval. Access is service-role only
--    through /api/business, so no storage.objects policies are added. On Apply, HQ copies the chosen
--    photo into the public location-photos path and sets locations.image_source = 'venue_owner'.
insert into storage.buckets (id, name, public)
values ('business-uploads', 'business-uploads', false)
on conflict (id) do nothing;

-- 6. Alerts: no schema change. The new kinds 'owner_change_request' and 'review_reply' are passed to
--    hq_fire_alert by the application in Tasks 2 to 5. 'business_claim' already fires today.

commit;
