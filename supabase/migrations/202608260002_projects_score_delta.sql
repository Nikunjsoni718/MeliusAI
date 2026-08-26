begin;

alter table public.projects
  add column if not exists score_delta integer,
  add column if not exists delta_summary text;

alter table public.project_folders
  add column if not exists score_delta integer,
  add column if not exists delta_summary text,
  add column if not exists executive_summary text,
  add column if not exists pros text[] not null default ARRAY[]::text[],
  add column if not exists cons text[] not null default ARRAY[]::text[],
  add column if not exists recommendations text[] not null default ARRAY[]::text[];

commit;
