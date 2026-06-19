alter table public.organizations
  add column if not exists mission_text text;

update public.organizations
set mission_text = coalesce(mission_text, description, bio)
where mission_text is null;
