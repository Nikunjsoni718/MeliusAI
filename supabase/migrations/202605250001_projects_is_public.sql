begin;

alter table public.projects
add column if not exists is_public boolean;

update public.projects
set is_public = true
where is_public is null;

alter table public.projects
alter column is_public set default true;

alter table public.projects
alter column is_public set not null;

commit;
