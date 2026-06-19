alter table public.organizations
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists contact_email text;

update public.organizations
set
  name = coalesce(name, company_name),
  description = coalesce(description, bio),
  contact_email = coalesce(contact_email, org_email)
where name is null
   or description is null
   or contact_email is null;
