export const CURRENT_STATUS_OPTIONS = [
  'Open to work',
  'Actively interviewing',
  'Employed',
  'Studying',
  'Freelancing',
  'Building startup',
] as const;

export type CurrentStatus = (typeof CURRENT_STATUS_OPTIONS)[number];

export type PersistedSettings = {
  username: string | null;
  current_status: CurrentStatus | null;
  public_profile_enabled: boolean;
  public_scorecard_enabled: boolean;
  public_contact_email_enabled: boolean;
  default_asset_is_public: boolean;
  audit_alerts_enabled: boolean;
  opportunity_match_alerts_enabled: boolean;
};

export const SETTINGS_PROFILE_SELECT =
  'username, current_status, public_profile_enabled, public_scorecard_enabled, public_contact_email_enabled, default_asset_is_public, audit_alerts_enabled, opportunity_match_alerts_enabled';

export function isCurrentStatus(value: unknown): value is CurrentStatus {
  return typeof value === 'string' && CURRENT_STATUS_OPTIONS.includes(value as CurrentStatus);
}
