alter table public.profiles
  add column if not exists extracted_experience text[] not null default '{}'::text[],
  add column if not exists extracted_preferences text[] not null default '{}'::text[];

comment on column public.profiles.extracted_experience is
  'Technical experience signals extracted from the candidate bio by the LLM pipeline.';

comment on column public.profiles.extracted_preferences is
  'Work preferences extracted from the candidate bio by the LLM pipeline.';
