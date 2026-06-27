alter table public.organizations
  add column if not exists hero_eyebrow text,
  add column if not exists verified_badge_text text,
  add column if not exists section1_subheading text,
  add column if not exists section1_heading text,
  add column if not exists section2_subheading text,
  add column if not exists section2_heading text,
  add column if not exists section2_desc text,
  add column if not exists section3_subheading text,
  add column if not exists footer_note text,
  add column if not exists footer_badge_text text,
  add column if not exists loading_status_text text;

update public.organizations
set
  hero_eyebrow = coalesce(nullif(hero_eyebrow, ''), company_name, name),
  verified_badge_text = coalesce(nullif(verified_badge_text, ''), 'Verified Workspace'),
  section1_subheading = coalesce(nullif(section1_subheading, ''), 'Company feature'),
  section1_heading = coalesce(nullif(section1_heading, ''), 'How we turn intent into execution.'),
  section2_subheading = coalesce(nullif(section2_subheading, ''), 'Infrastructure'),
  section2_heading = coalesce(nullif(section2_heading, ''), nullif(infrastructure_title, ''), nullif(pillar2_title, 'Execution Style')),
  section2_desc = coalesce(
    nullif(section2_desc, ''),
    nullif(infrastructure_desc, ''),
    nullif(tech_input, ''),
    nullif(nullif(pillar2_desc, ''), 'Your description here...')
  ),
  section3_subheading = coalesce(nullif(section3_subheading, ''), 'Benefits'),
  footer_note = coalesce(nullif(footer_note, ''), 'Verified through MeliusAI.'),
  footer_badge_text = coalesce(nullif(footer_badge_text, ''), 'Protected workspace profile'),
  loading_status_text = coalesce(nullif(loading_status_text, ''), 'Synchronizing verified workspace details...')
where hero_eyebrow is null
   or verified_badge_text is null
   or section1_subheading is null
   or section1_heading is null
   or section2_subheading is null
   or section2_heading is null
   or section2_desc is null
   or section3_subheading is null
   or footer_note is null
   or footer_badge_text is null
   or loading_status_text is null;
