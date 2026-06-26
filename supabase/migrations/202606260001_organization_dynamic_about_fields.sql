alter table public.organizations
  add column if not exists mission_title text,
  add column if not exists mission_desc text,
  add column if not exists feature_one_title text,
  add column if not exists feature_one_desc text,
  add column if not exists infrastructure_title text,
  add column if not exists infrastructure_desc text,
  add column if not exists benefit_title text,
  add column if not exists benefit_desc text;

update public.organizations
set
  mission_title = coalesce(nullif(mission_title, ''), company_name, name),
  mission_desc = coalesce(
    nullif(mission_desc, ''),
    nullif(mission_text, ''),
    nullif(description, ''),
    nullif(bio, '')
  ),
  feature_one_title = coalesce(nullif(feature_one_title, ''), nullif(pillar1_title, 'Core Principle')),
  feature_one_desc = coalesce(
    nullif(feature_one_desc, ''),
    nullif(nullif(pillar1_desc, ''), 'Your description here...')
  ),
  infrastructure_title = coalesce(nullif(infrastructure_title, ''), nullif(pillar2_title, 'Execution Style')),
  infrastructure_desc = coalesce(
    nullif(infrastructure_desc, ''),
    nullif(tech_input, ''),
    nullif(nullif(pillar2_desc, ''), 'Your description here...')
  ),
  benefit_desc = coalesce(nullif(benefit_desc, ''), nullif(perks_input, ''))
where mission_title is null
   or mission_desc is null
   or feature_one_title is null
   or feature_one_desc is null
   or infrastructure_title is null
   or infrastructure_desc is null
   or benefit_desc is null;
