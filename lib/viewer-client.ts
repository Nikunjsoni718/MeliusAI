'use client';

import type { Session, User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';

import {
  clearPersistedAuthState,
  persistAuthenticatedUser,
  readPersistedAuthState,
  type PersistedUserRole,
} from '@/lib/auth-session-routing';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';
import { appendUsernameSuffix, generateUsername } from '@/lib/username';
import { workspaceCacheKeys } from '@/lib/workspace-cache';
import { useViewerBootstrap } from '@/components/providers/workspace-data-hydration';
import type { UserRole } from '@/types/supabase';
import type { ViewerProfile } from '@/lib/viewer-types';

export type { ViewerProfile } from '@/lib/viewer-types';

type ProfileResponse = {
  data?: ViewerProfile | null;
  email?: string | null;
  id?: string | null;
  role?: UserRole | 'user';
  user?: ViewerProfile | null;
  error?: string;
} & Partial<ViewerProfile>;

const VIEWER_SESSION_CHECK_TIMEOUT_MS = 3500;
const GITHUB_CONNECTION_UI_STORAGE_KEYS = [
  'github_app_prompted',
  'github_success_dismissed',
] as const;
const GITHUB_CONNECTION_INTENT_STORAGE_KEY = 'intent_to_link_github';

export function isViewerProfileOwner({
  viewerId,
  viewerUsername,
  profileId,
  targetUsername,
}: {
  viewerId?: string | null;
  viewerUsername?: string | null;
  profileId?: string | null;
  targetUsername?: string | null;
}) {
  const idsMatch = Boolean(viewerId && profileId && viewerId === profileId);
  const normalizedViewerUsername = viewerUsername?.trim().toLowerCase();
  const normalizedTargetUsername = targetUsername?.trim().replace(/^@+/, '').toLowerCase();
  const usernamesMatch = Boolean(
    normalizedViewerUsername &&
      normalizedTargetUsername &&
      normalizedViewerUsername === normalizedTargetUsername
  );

  return idsMatch || usernamesMatch;
}

function clearGitHubConnectionUiState() {
  if (typeof window === 'undefined') {
    return;
  }

  GITHUB_CONNECTION_UI_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  window.sessionStorage.removeItem(GITHUB_CONNECTION_INTENT_STORAGE_KEY);
}

function normalizeViewerProfileResponse(body: ProfileResponse | null): ViewerProfile | null {
  const candidate = body?.data ?? body?.user ?? body;

  if (!candidate?.id) {
    return null;
  }

  return {
    id: candidate.id,
    role: candidate.role === 'recruiter' ? 'recruiter' : 'talent',
    role_selected_at: candidate.role_selected_at ?? null,
    display_name: candidate.display_name ?? '',
    username: candidate.username ?? null,
    birth_date: candidate.birth_date ?? null,
    bio: candidate.bio ?? null,
    current_status: candidate.current_status ?? null,
    public_profile_enabled: candidate.public_profile_enabled ?? true,
    public_scorecard_enabled: candidate.public_scorecard_enabled ?? true,
    public_contact_email_enabled: candidate.public_contact_email_enabled ?? false,
    default_asset_is_public: candidate.default_asset_is_public ?? true,
    audit_alerts_enabled: candidate.audit_alerts_enabled ?? true,
    opportunity_match_alerts_enabled: candidate.opportunity_match_alerts_enabled ?? true,
    headline: candidate.headline ?? null,
    company_name: candidate.company_name ?? null,
    github_username: candidate.github_username ?? null,
    avatar_url: candidate.avatar_url ?? null,
    is_github_linked: candidate.is_github_linked === true,
  };
}

export function getDashboardHref(role: UserRole) {
  return role === 'recruiter' ? '/company' : '/home';
}

export function useViewerProfile() {
  const pathname = usePathname();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const bootstrap = useViewerBootstrap();
  const authEnabled = hasSupabaseBrowserEnv();
  const [supabase] = useState<ReturnType<typeof createSupabaseBrowserClient> | null>(() => {
    return authEnabled ? createSupabaseBrowserClient() : null;
  });
  const [loading, setLoading] = useState(authEnabled && !bootstrap?.user);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(() => bootstrap?.user ?? null);
  const [profile, setProfile] = useState<ViewerProfile | null>(() => bootstrap?.profile ?? null);
  const [error, setError] = useState<string | null>(null);
  const [persistedRole, setPersistedRole] = useState<PersistedUserRole | null>(null);
  const authRefreshTimerRef = useRef<number | null>(null);
  const hasLoadedViewerRef = useRef(Boolean(bootstrap?.user));
  const hasPendingBootstrapProfileRef = useRef(Boolean(bootstrap?.user && bootstrap?.profile));
  const viewerLoadRevisionRef = useRef(0);
  const cachedViewerIdRef = useRef<string | null | undefined>(undefined);

  const syncWorkspaceAuthCache = useCallback(
    (nextSession: Session | null) => {
      const nextViewerId = nextSession?.user?.id ?? null;
      const previousViewerId = cachedViewerIdRef.current;
      cachedViewerIdRef.current = nextViewerId;

      if (previousViewerId !== nextViewerId) {
        void mutate(
          (key) => Array.isArray(key) && key[0] === 'workspace',
          undefined,
          { revalidate: false }
        );
      }

      void mutate(workspaceCacheKeys.viewerSession, nextSession, { revalidate: false });
    },
    [mutate]
  );

  useEffect(() => {
    if (!bootstrap?.user) return;

    hasLoadedViewerRef.current = true;
    cachedViewerIdRef.current = bootstrap.user.id;
    setUser(bootstrap.user);
    setProfile(bootstrap.profile);
    setLoading(false);
    hasPendingBootstrapProfileRef.current = Boolean(bootstrap.profile);
    if (bootstrap.profile) {
      void mutate(workspaceCacheKeys.viewerProfile(bootstrap.user.id), bootstrap.profile, {
        revalidate: false,
      });
    }
  }, [bootstrap?.profile, bootstrap?.user, mutate]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const persistedState = readPersistedAuthState();
      setPersistedRole(persistedState.userRole);
    }

    if (!supabase) {
      return;
    }

    let active = true;

    const loadViewer = async ({ showLoading = !hasLoadedViewerRef.current }: { showLoading?: boolean } = {}) => {
      const loadRevision = viewerLoadRevisionRef.current + 1;
      viewerLoadRevisionRef.current = loadRevision;
      const canCommit = () => active && loadRevision === viewerLoadRevisionRef.current;

      if (showLoading) {
        setLoading(true);
      }

      const readSession = async () => {
        try {
          return await Promise.race([
            supabase.auth.getSession(),
            new Promise<'timeout'>((resolve) =>
              window.setTimeout(() => resolve('timeout'), VIEWER_SESSION_CHECK_TIMEOUT_MS)
            ),
          ]);
        } catch (sessionReadError) {
          return {
            data: { session: null },
            error:
              sessionReadError instanceof Error
                ? sessionReadError
                : new Error('Unable to resolve the current session.'),
          };
        }
      };

      let sessionResult = await readSession();

      if (!canCommit()) {
        return;
      }

      if (sessionResult === 'timeout') {
        console.warn('Viewer session check timed out; showing public auth content.');
        setSession(null);
        setUser(null);
        setProfile(null);
        setError(null);
        syncWorkspaceAuthCache(null);
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      let {
        data: { session: currentSession },
        error: sessionError,
      } = sessionResult;

      const persistedState = readPersistedAuthState();
      if (!currentSession?.user && persistedState.loginStatus === 'loggedIn' && !hasLoadedViewerRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 450));

        if (!canCommit()) {
          return;
        }

        const retryResult = await readSession();

        if (!canCommit()) {
          return;
        }

        if (retryResult === 'timeout') {
          console.warn('Viewer session retry timed out; showing public auth content.');
          setSession(null);
          setUser(null);
          setProfile(null);
          setError(null);
          syncWorkspaceAuthCache(null);
          hasLoadedViewerRef.current = true;
          setLoading(false);
          return;
        }

        currentSession = retryResult.data.session;
        sessionError = retryResult.error;
      }

      if (sessionError) {
        setSession(null);
        setUser(null);
        setError(sessionError.message);
        syncWorkspaceAuthCache(null);
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      const currentUser = currentSession?.user ?? null;
      syncWorkspaceAuthCache(currentSession ?? null);
      setSession(currentSession ?? null);
      setUser(currentUser);

      if (!currentUser) {
        clearPersistedAuthState();
        setPersistedRole(null);
        setProfile(null);
        setError(null);
        syncWorkspaceAuthCache(null);
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      persistAuthenticatedUser(currentUser);
      setPersistedRole(readPersistedAuthState().userRole);
      setError(null);
      hasLoadedViewerRef.current = true;

      // The server bootstrap has already validated this user and loaded the
      // same profile projection. Consume it once instead of immediately
      // issuing a duplicate /api/auth/profile request during hydration.
      if (
        hasPendingBootstrapProfileRef.current &&
        bootstrap?.user?.id === currentUser.id &&
        bootstrap.profile
      ) {
        hasPendingBootstrapProfileRef.current = false;
        setProfile(bootstrap.profile);
        void mutate(workspaceCacheKeys.viewerProfile(currentUser.id), bootstrap.profile, {
          revalidate: false,
        });
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/profile', {
          cache: 'no-store',
          credentials: 'include',
        });
        const body = (await response.json().catch(() => null)) as ProfileResponse | null;

        if (!canCommit()) {
          return;
        }

        if (response.status === 401) {
          setProfile(null);
          setError(null);
          void mutate(workspaceCacheKeys.viewerProfile(currentUser.id), undefined, { revalidate: false });
          return;
        }

        if (!response.ok) {
          setError(body?.error ?? 'Unable to load profile.');
          return;
        }

        let nextProfile = normalizeViewerProfileResponse(body);

        if (nextProfile) {
          const { data: storedProfile, error: profileLookupError } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', currentUser.id)
            .maybeSingle();

          if (profileLookupError) {
            setError(`Unable to check your profile username: ${profileLookupError.message}`);
            return;
          }

          let resolvedUsername = storedProfile?.username?.trim() || nextProfile.username?.trim() || null;

          if (!resolvedUsername) {
            const generatedUsername = generateUsername(currentUser);
            const { data: conflictingProfile, error: usernameLookupError } = await supabase
              .from('profiles')
              .select('id')
              .eq('username', generatedUsername)
              .neq('id', currentUser.id)
              .limit(1)
              .maybeSingle();

            if (usernameLookupError) {
              setError(`Unable to reserve your profile username: ${usernameLookupError.message}`);
              return;
            }

            resolvedUsername = conflictingProfile
              ? appendUsernameSuffix(generatedUsername, currentUser.id)
              : generatedUsername;

            let { error: usernameUpdateError } = await supabase
              .from('profiles')
              .update({ username: resolvedUsername })
              .eq('id', currentUser.id);

            if (usernameUpdateError?.code === '23505') {
              resolvedUsername = appendUsernameSuffix(generatedUsername, currentUser.id);
              ({ error: usernameUpdateError } = await supabase
                .from('profiles')
                .update({ username: resolvedUsername })
                .eq('id', currentUser.id));
            }

            if (usernameUpdateError) {
              setError(`Unable to save your profile username: ${usernameUpdateError.message}`);
              return;
            }

            nextProfile = { ...nextProfile, username: resolvedUsername };
          }

          if (resolvedUsername && nextProfile.username !== resolvedUsername) {
            nextProfile = { ...nextProfile, username: resolvedUsername };
          }

          if (resolvedUsername && currentUser.user_metadata?.username !== resolvedUsername) {
            const { data: metadataData, error: metadataError } = await supabase.auth.updateUser({
              data: {
                ...currentUser.user_metadata,
                username: resolvedUsername,
              },
            });

            if (metadataError) {
              console.warn('Profile username saved, but auth metadata sync failed:', metadataError.message);
            } else if (metadataData.user) {
              setUser(metadataData.user);
              persistAuthenticatedUser(metadataData.user);
            }
          }

          if (resolvedUsername) {
            const legacyProfilePrefix = `/profile/${encodeURIComponent(currentUser.id)}`;
            if (pathname === legacyProfilePrefix || pathname.startsWith(`${legacyProfilePrefix}/`)) {
              const remainingPath = pathname.slice(legacyProfilePrefix.length);
              router.replace(`/profile/${encodeURIComponent(resolvedUsername)}${remainingPath}`);
            }
          }
        }

        setProfile(nextProfile);
        void mutate(workspaceCacheKeys.viewerProfile(currentUser.id), nextProfile, { revalidate: false });
        setError(null);
      } catch (profileError) {
        if (canCommit()) {
          setProfile(null);
          setError(profileError instanceof Error ? profileError.message : 'Unable to load profile.');
          void mutate(workspaceCacheKeys.viewerProfile(currentUser.id), undefined, { revalidate: false });
        }
      } finally {
        if (canCommit()) {
          setLoading(false);
        }
      }
    };

    void loadViewer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (authRefreshTimerRef.current) {
        window.clearTimeout(authRefreshTimerRef.current);
      }

      // Invalidate any in-flight viewer load before mutating local auth state.
      // This prevents a late response for the previous account from winning.
      viewerLoadRevisionRef.current += 1;
      syncWorkspaceAuthCache(nextSession ?? null);

      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);

      if (event === 'SIGNED_OUT' || !nextSession?.user) {
        // Clear the in-memory profile plus GitHub-specific UI flags before the
        // scheduled read runs. This prevents a prior account's username or
        // repository state from painting after sign-out.
        clearPersistedAuthState();
        clearGitHubConnectionUiState();
        setPersistedRole(null);
        setProfile(null);
        setError(null);
      }

      if (event === 'SIGNED_IN') {
        setLoading(true);
      }

      const refreshDelay = event === 'SIGNED_IN' || event === 'SIGNED_OUT' ? 0 : 350;
      authRefreshTimerRef.current = window.setTimeout(() => {
        void loadViewer({ showLoading: event === 'SIGNED_IN' });
      }, refreshDelay);
    });

    return () => {
      active = false;
      if (authRefreshTimerRef.current) {
        window.clearTimeout(authRefreshTimerRef.current);
      }
      subscription.unsubscribe();
    };
  }, [bootstrap, pathname, router, supabase, syncWorkspaceAuthCache, mutate]);

  return {
    authEnabled,
    error,
    hasAccessToken: Boolean(session?.access_token),
    isAuthLoading: loading,
    isSessionChecking: loading,
    loading,
    profile,
    setProfile,
    persistedRole,
    session,
    supabase,
    user,
    viewer: user
      ? {
          id: user.id,
          username:
            profile?.username ??
            (typeof user.user_metadata?.username === 'string'
              ? user.user_metadata.username
              : typeof user.user_metadata?.preferred_username === 'string'
                ? user.user_metadata.preferred_username
                : null),
        }
      : null,
  };
}

