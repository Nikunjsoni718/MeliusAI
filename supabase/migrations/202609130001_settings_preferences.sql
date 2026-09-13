-- Persisted profile, Vault, and notification settings. Defaults preserve existing public behaviour.
alter table public.profiles
  add column if not exists public_profile_enabled boolean not null default true,
  add column if not exists public_scorecard_enabled boolean not null default true,
  add column if not exists public_contact_email_enabled boolean not null default false,
  add column if not exists default_asset_is_public boolean not null default true,
  add column if not exists audit_alerts_enabled boolean not null default false,
  add column if not exists opportunity_match_alerts_enabled boolean not null default false;

update public.profiles
set current_status = case current_status
  when 'Working' then 'Employed'
  when 'Looking for an Opportunity' then 'Open to work'
  else current_status
end
where current_status is not null
  and current_status not in (
    'Open to work',
    'Actively interviewing',
    'Employed',
    'Studying',
    'Freelancing',
    'Building startup'
  );

alter table public.profiles
  drop constraint if exists profiles_current_status_check,
  add constraint profiles_current_status_check check (
    current_status is null or current_status in (
      'Open to work',
      'Actively interviewing',
      'Employed',
      'Studying',
      'Freelancing',
      'Building startup'
    )
  );

-- Browser clients read the restricted directory view rather than the base table,
-- which deliberately prevents a public-profile query from exposing email.
create or replace view public.public_profile_directory
with (security_barrier = true)
as
select
  id,
  full_name,
  username,
  current_status,
  avatar_url,
  case when public_contact_email_enabled then email else null end as email
from public.profiles
where public_profile_enabled;

grant select on public.public_profile_directory to anon, authenticated;

drop policy if exists "Profiles are readable" on public.profiles;
create policy "Profile owners and recruiters can read profiles"
on public.profiles
for select
using (id = auth.uid() or public.is_recruiter());
