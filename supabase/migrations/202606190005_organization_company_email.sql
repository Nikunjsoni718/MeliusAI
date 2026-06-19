alter table public.organizations
  add column if not exists company_email text;

update public.organizations
set company_email = coalesce(company_email, contact_email, org_email)
where company_email is null;
