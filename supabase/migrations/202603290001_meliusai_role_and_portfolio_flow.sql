begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'github_url'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'file_url'
  ) then
    alter table public.projects rename column github_url to file_url;
  end if;
end $$;

alter table public.projects
  add column if not exists file_type text not null default 'github',
  add column if not exists profession text not null default 'Developer',
  add column if not exists target_company text,
  add column if not exists auto_apply_enabled boolean not null default false;

alter table public.projects
  drop constraint if exists projects_github_url_check;

commit;
