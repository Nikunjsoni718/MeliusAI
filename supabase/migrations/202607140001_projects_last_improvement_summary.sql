begin;

alter table public.projects
  add column if not exists last_improvement_summary text;

comment on column public.projects.last_improvement_summary is
  'Most recent AI-authored comparison between the current and previous project audits.';

commit;
