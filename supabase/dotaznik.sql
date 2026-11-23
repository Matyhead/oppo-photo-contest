-- Wide phone survey (page /dotaznik, admin /admin/dotaznik).
-- Run once in Supabase → SQL Editor. The same block is at the end of schema.sql.

create extension if not exists pgcrypto;

create table if not exists public.survey_responses (
  id               uuid primary key default gen_random_uuid(),
  survey           text not null,                    -- SURVEY.slug in lib/survey.ts
  answers          jsonb not null,                   -- { questionId: value | [values] | { row: value } }
  open_answers     jsonb not null default '{}'::jsonb, -- optional free text
  src              text not null default 'primo',    -- ?src= from the link (influencer, newsletter, sharing)
  wants_meeting    boolean,                          -- invite to an in-person session; null = not asked (under 18)
  email            text,                             -- only with contact_consent
  contact_consent  boolean not null default false,
  duration_s       integer,                          -- time from start to submit
  device           text,                             -- 'mobil' or 'pocitac'
  ip_hash          text,
  created_at       timestamptz not null default now()
);

create index if not exists survey_responses_survey_idx on public.survey_responses (survey, created_at);
create index if not exists survey_responses_ip_idx on public.survey_responses (ip_hash, created_at);

-- Server only (service role key), closed to the public API like the other tables.
alter table public.survey_responses enable row level security;
revoke all on public.survey_responses from anon, authenticated;
