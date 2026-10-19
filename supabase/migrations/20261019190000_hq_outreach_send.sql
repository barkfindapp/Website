-- hq_outreach_send: sending outreach email from HQ (branch hq-outreach-send), 19 October 2026.
-- Written by the HQ chat; NOT applied. Josh runs it in the SQL Editor after reading it.
-- Additive only. RLS stays on with no policies on every table here, so only HQ's server
-- connection can read or write them.

begin;

-- 1. The sender, per member of staff: the From name and address (on hello.barkfind.com, the
-- outreach sending domain), where replies go, and the title shown in the signature. Nothing
-- sends unless name, address and reply-to are all set. Set in Admin, Team.
alter table public.hq_staff
  add column outreach_from_name  text check (outreach_from_name is null or char_length(outreach_from_name) between 1 and 80),
  add column outreach_from_email text check (outreach_from_email is null or outreach_from_email ~* '^[a-z0-9._%+-]+@hello\.barkfind\.com$'),
  add column outreach_reply_to   text check (outreach_reply_to is null or outreach_reply_to ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  add column outreach_title      text check (outreach_title is null or char_length(outreach_title) between 1 and 60);

-- Josh and Megan, as agreed on 19 October. Matched by user id; change them in Admin, Team.
update public.hq_staff set outreach_from_name = 'Josh at BarkFind', outreach_from_email = 'josh@hello.barkfind.com',
       outreach_reply_to = 'josh@barkfind.com', outreach_title = 'Founder'
 where user_id = '727210dc-d309-493d-8744-066033c2a6f9';
update public.hq_staff set outreach_from_name = 'Megan at BarkFind', outreach_from_email = 'megan@hello.barkfind.com',
       outreach_reply_to = 'megan@barkfind.com', outreach_title = 'Partnerships'
 where user_id = '30dced1a-9e7d-4859-8763-c977a21bf9d2';

-- 2. Email templates. The server renders them; only {{name}}, {{place_name}}, {{place_url}}
-- and {{area}} are allowed (HQ refuses anything else when a template is saved).
create table public.outreach_templates (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'any' check (kind in ('any', 'creator', 'creator_prospect', 'venue', 'press', 'partner', 'community', 'other')),
  name       text not null unique check (char_length(name) between 1 and 80),
  subject    text not null check (char_length(subject) between 1 and 200),
  body       text not null check (char_length(body) between 1 and 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.hq_staff(user_id) on delete set null
);
alter table public.outreach_templates enable row level security;
revoke all on public.outreach_templates from anon, authenticated;

-- A first template, framed as "you are already listed, please check your listing". Edit it in HQ.
insert into public.outreach_templates (kind, name, subject, body) values ('venue', 'Check your listing',
  'Your listing on BarkFind',
  E'Hello,\n\nI am getting in touch because {{place_name}} is listed on BarkFind, a free app that helps dog owners find places that are genuinely good with dogs.\n\nCould you take a quick look and let me know if anything is out of date, such as opening hours or where dogs are welcome? A one-line reply to this email is all it takes, and I will update it.\n\nThank you for your time.');

-- 3. Which email a log entry was, so a bounce or complaint can be matched to the contact.
alter table public.hq_outreach_log add column provider_id text;
create index hq_outreach_log_provider_idx on public.hq_outreach_log (provider_id) where provider_id is not null;

-- 4. Settings. The daily cap is per person; the strapline sits in the email signature.
insert into public.app_config (key, value, note) values
  ('outreach_daily_cap', '15', 'Outreach emails each member of staff may send from HQ per UK day.'),
  ('outreach_strapline', 'Dog-friendly places, rated by dog owners', 'The line under the name in the outreach email signature.')
on conflict (key) do nothing;

-- 5. The key that signs unsubscribe links (an HMAC over the contact id). Random, made here,
-- never shown anywhere. Changing it later breaks the links in emails already sent.
insert into public.app_secrets (name, value)
values ('outreach_unsubscribe_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

commit;

-- 6. AFTER creating the webhook in Resend (Webhooks, Add endpoint:
--    https://www.barkfind.com/api/outreach-resend-webhook, events email.bounced and email.complained),
--    copy its signing secret (it starts whsec_) and run, with the real value:
--
--    insert into public.app_secrets (name, value) values ('resend_outreach_webhook_secret', 'whsec_...')
--    on conflict (name) do update set value = excluded.value;
--
--    Until that row exists the webhook refuses every request.
