begin;

alter table public.profiles
  add column if not exists resume_projects jsonb not null default '[]'::jsonb,
  add column if not exists external_links jsonb not null default '[]'::jsonb;

alter table public.profiles
  alter column resume_projects set default '[]'::jsonb,
  alter column external_links set default '[]'::jsonb;

commit;
