alter table public.organizations
  add column if not exists org_email text;
