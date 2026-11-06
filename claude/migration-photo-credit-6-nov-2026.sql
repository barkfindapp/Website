-- Add locations.photo_credit, so an owner-supplied photo can carry a visible credit
-- to the venue in the app. 6 November 2026. For the project chat to apply in the
-- Supabase SQL Editor after Josh has read it. The website code sets it on Apply of an
-- owner change, and tolerates the column not existing yet, so running this is safe at
-- any time (the credit simply starts being recorded once it is applied).

begin;

alter table public.locations
  add column if not exists photo_credit text
    check (photo_credit is null or char_length(photo_credit) <= 200);

commit;
