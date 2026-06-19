begin;

alter table public.opportunities
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists company_name text default 'Verified Organisation',
  add column if not exists company_email text;

update public.opportunities
set
  title = coalesce(title, job_title),
  description = coalesce(description, job_description),
  company_name = coalesce(company_name, organization_name, 'Verified Organisation')
where title is null
   or description is null
   or company_name is null;

alter table public.opportunities
  alter column title set not null,
  alter column description set not null,
  alter column company_name set default 'Verified Organisation';

commit;
