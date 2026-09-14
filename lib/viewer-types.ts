import type { ProfileRow, UserRole } from '@/types/supabase';

export type ViewerProfile = Pick<
  ProfileRow,
  | 'id'
  | 'username'
  | 'birth_date'
  | 'bio'
  | 'avatar_url'
  | 'current_status'
  | 'public_profile_enabled'
  | 'public_scorecard_enabled'
  | 'public_contact_email_enabled'
  | 'default_asset_is_public'
  | 'audit_alerts_enabled'
  | 'opportunity_match_alerts_enabled'
> & {
  role: UserRole;
  role_selected_at: string | null;
  display_name: string;
  headline: string | null;
  company_name: string | null;
  github_username: string | null;
  is_github_linked: boolean;
};
