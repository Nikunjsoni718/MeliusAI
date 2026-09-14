-- Repair partially applied settings columns on existing installations. This is
-- intentionally forward-only: 202609130001_settings_preferences.sql may
-- already have been applied to production.
alter table public.profiles
  add column if not exists public_profile_enabled boolean,
  add column if not exists public_scorecard_enabled boolean,
  add column if not exists public_contact_email_enabled boolean,
  add column if not exists default_asset_is_public boolean,
  add column if not exists audit_alerts_enabled boolean,
  add column if not exists opportunity_match_alerts_enabled boolean;

update public.profiles
set public_profile_enabled = true
where public_profile_enabled is null;

update public.profiles
set public_scorecard_enabled = true
where public_scorecard_enabled is null;

update public.profiles
set default_asset_is_public = true
where default_asset_is_public is null;

update public.profiles
set public_contact_email_enabled = false
where public_contact_email_enabled is null;

update public.profiles
set audit_alerts_enabled = false
where audit_alerts_enabled is null;

update public.profiles
set opportunity_match_alerts_enabled = false
where opportunity_match_alerts_enabled is null;

alter table public.profiles
  alter column public_profile_enabled set default true,
  alter column public_profile_enabled set not null,
  alter column public_scorecard_enabled set default true,
  alter column public_scorecard_enabled set not null,
  alter column public_contact_email_enabled set default false,
  alter column public_contact_email_enabled set not null,
  alter column default_asset_is_public set default true,
  alter column default_asset_is_public set not null,
  alter column audit_alerts_enabled set default false,
  alter column audit_alerts_enabled set not null,
  alter column opportunity_match_alerts_enabled set default false,
  alter column opportunity_match_alerts_enabled set not null;
