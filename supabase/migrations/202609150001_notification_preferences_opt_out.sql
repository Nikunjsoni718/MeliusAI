-- New profiles receive notification preferences as enabled by default.
-- Existing false values are preserved as explicit opt-outs.
alter table public.profiles
  alter column audit_alerts_enabled set default true,
  alter column opportunity_match_alerts_enabled set default true;
