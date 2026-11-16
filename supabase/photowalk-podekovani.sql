-- Photo walk: thank-you e-mail after the walk with a discount code.
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table public.photowalk_signups
  add column if not exists thanks_sent_at timestamptz, -- when the thank-you e-mail went out
  add column if not exists discount_code  text;        -- the code it carried
