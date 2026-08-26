begin;

alter table public.projects
  add column if not exists score_delta integer,
  add column if not exists delta_summary text;

commit;
