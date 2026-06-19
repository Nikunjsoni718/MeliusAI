alter table public.organizations
  add column if not exists pillar1_title text default 'Core Principle',
  add column if not exists pillar1_desc text default 'Your description here...',
  add column if not exists pillar2_title text default 'Execution Style',
  add column if not exists pillar2_desc text default 'Your description here...',
  add column if not exists tech_input text default 'Next.js, Supabase',
  add column if not exists perks_input text default 'Flexible Hours, Competitive Equity';
