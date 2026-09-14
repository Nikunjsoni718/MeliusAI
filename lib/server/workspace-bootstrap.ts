import 'server-only';

import type { User } from '@supabase/supabase-js';
import { cache } from 'react';

import { hasSupabaseServerEnv, createSupabaseServerClient } from '@/lib/supabase/server';
import type { ViewerProfile } from '@/lib/viewer-types';
import type { WorkspaceBootstrap } from '@/lib/workspace-bootstrap';

const VIEWER_PROFILE_SELECT =
  'id, username, full_name, birth_date, bio, avatar_url, github_username, current_status, public_profile_enabled, public_scorecard_enabled, public_contact_email_enabled, default_asset_is_public, audit_alerts_enabled, opportunity_match_alerts_enabled';

type ViewerProfileRecord = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  birth_date?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  github_username?: string | null;
  current_status?: string | null;
  public_profile_enabled?: boolean | null;
  public_scorecard_enabled?: boolean | null;
  public_contact_email_enabled?: boolean | null;
  default_asset_is_public?: boolean | null;
  audit_alerts_enabled?: boolean | null;
  opportunity_match_alerts_enabled?: boolean | null;
};

function metadataText(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function viewerRole(user: User): ViewerProfile['role'] {
  const rawRole = typeof user.user_metadata?.role === 'string'
    ? user.user_metadata.role.trim().toLowerCase()
    : '';
  return rawRole === 'recruiter' || rawRole === 'corporate' || rawRole === 'organization' || rawRole === 'organisation'
    ? 'recruiter'
    : 'talent';
}

function toViewerProfile(user: User, record: ViewerProfileRecord | null): ViewerProfile | null {
  if (!record?.id) return null;

  const providers = user.app_metadata?.providers;
  const githubLinked =
    user.identities?.some((identity) => identity.provider === 'github') === true ||
    (Array.isArray(providers) && providers.some((provider) => provider === 'github'));

  return {
    id: record.id,
    role: viewerRole(user),
    role_selected_at: metadataText(user, 'role_selected_at'),
    display_name:
      record.full_name ??
      metadataText(user, 'display_name') ??
      metadataText(user, 'full_name') ??
      user.email?.split('@')[0] ??
      '',
    username: record.username ?? metadataText(user, 'username'),
    birth_date: record.birth_date ?? null,
    bio: record.bio ?? null,
    avatar_url: record.avatar_url ?? metadataText(user, 'avatar_url'),
    current_status: record.current_status ?? null,
    public_profile_enabled: record.public_profile_enabled ?? true,
    public_scorecard_enabled: record.public_scorecard_enabled ?? true,
    public_contact_email_enabled: record.public_contact_email_enabled ?? false,
    default_asset_is_public: record.default_asset_is_public ?? true,
    audit_alerts_enabled: record.audit_alerts_enabled ?? false,
    opportunity_match_alerts_enabled: record.opportunity_match_alerts_enabled ?? false,
    headline: null,
    company_name: null,
    github_username: record.github_username ?? null,
    is_github_linked: githubLinked,
  };
}

export const loadWorkspaceBootstrap = cache(async (): Promise<WorkspaceBootstrap> => {
  const empty: WorkspaceBootstrap = {
    viewer: { user: null, profile: null },
    accessToken: null,
  };

  if (!hasSupabaseServerEnv()) return empty;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return empty;

    const [{ data: sessionData }, profileResult] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('profiles').select(VIEWER_PROFILE_SELECT).eq('id', user.id).maybeSingle(),
    ]);

    if (profileResult.error) {
      console.warn('Unable to bootstrap the viewer profile:', profileResult.error.message);
    }

    return {
      viewer: {
        user,
        profile: toViewerProfile(user, (profileResult.data as ViewerProfileRecord | null) ?? null),
      },
      accessToken: sessionData.session?.access_token ?? null,
    };
  } catch (error) {
    console.warn('Unable to bootstrap the workspace viewer:', error);
    return empty;
  }
});
