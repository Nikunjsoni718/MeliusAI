begin;

alter table public.projects
alter column is_public set default true;

update public.projects
set is_public = true
where is_public is null;

alter table public.projects
alter column is_public set not null;

drop policy if exists "Public projects are readable" on public.projects;
create policy "Public projects are readable"
on public.projects
for select
to anon, authenticated
using (is_public = true);

grant select on public.projects to anon, authenticated;

commit;
