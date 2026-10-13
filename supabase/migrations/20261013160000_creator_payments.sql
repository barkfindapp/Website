-- Creator payouts: a record of what Josh paid each creator for each month.
-- Written by HQ (api/_lib/hq-payouts.ts, op creator_payment_mark) over its server-side
-- postgres connection, read alongside the creator_payout_months view. One payment per
-- creator per month. RLS on with no policies: nothing outside HQ's server can read or
-- write it. Applied from the BarkFind project chat, 13 October 2026.

create table public.creator_payments (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id),
  month       text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_gbp  numeric(10,2) not null check (amount_gbp >= 0),
  paid_on     date not null,
  reference   text check (reference is null or char_length(reference) <= 200),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (creator_id, month)
);

alter table public.creator_payments enable row level security;
revoke all on public.creator_payments from anon, authenticated;

comment on table public.creator_payments is
  'What was paid to each creator for each month (YYYY-MM, UK time). Written only by HQ (creator_payment_mark, audited in admin_audit). RLS on, no policies.';
