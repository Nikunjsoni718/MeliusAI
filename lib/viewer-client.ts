'use client';

import type { Session, User } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  clearPersistedAuthState,
  persistAuthenticatedUser,
  readPersistedAuthState,
  type PersistedUserRole,
} from '@/lib/auth-session-routing';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';
import { appendUsernameSuffix, generateUsername } from '@/lib/username';
import type { UserRow } from '@/types/supabase';

export type ViewerProfile = Pick<
  UserRow,
  | 'id'
  | 'role'
  | 'role_selected_at'
  | 'display_name'
  | 'username'
  | 'birth_date'
  | 'headline'
  | 'company_name'
  | 'github_username'
  | 'avatar_url'
>;

type ProfileResponse = {
  data?: ViewerProfile | null;
  email?: string | null;
  id?: string | null;
  role?: UserRow['role'] | 'user';
  user?: ViewerProfile | null;
  error?: string;
} & Partial<ViewerProfile>;

const VIEWER_SESSION_CHECK_TIMEOUT_MS = 3500;

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
    headline: candidate.headline ?? null,
    company_name: candidate.company_name ?? null,
    github_username: candidate.github_username ?? null,
    avatar_url: candidate.avatar_url ?? null,
  };
}

export function getDashboardHref(role: UserRow['role']) {
  return role === 'recruiter' ? '/company' : '/home';
}

export function useViewerProfile() {
  const pathname = usePathname();
  const router = useRouter();
  const authEnabled = hasSupabaseBrowserEnv();
  const [supabase] = useState<ReturnType<typeof createSupabaseBrowserClient> | null>(() => {
    return authEnabled ? createSupabaseBrowserClient() : null;
  });
  const [loading, setLoading] = useState(authEnabled);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ViewerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persistedRole, setPersistedRole] = useState<PersistedUserRole | null>(null);
  const authRefreshTimerRef = useRef<number | null>(null);
  const hasLoadedViewerRef = useRef(false);

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
      if (showLoading) {
        setLoading(true);
      }

      const readSession = () =>
        Promise.race([
          supabase.auth.getSession(),
          new Promise<'timeout'>((resolve) =>
            window.setTimeout(() => resolve('timeout'), VIEWER_SESSION_CHECK_TIMEOUT_MS)
          ),
        ]);

      let sessionResult = await readSession();

      if (!active) {
        return;
      }

      if (sessionResult === 'timeout') {
        console.warn('Viewer session check timed out; showing public auth content.');
        setSession(null);
        setUser(null);
        setProfile(null);
        setError(null);
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

        if (!active) {
          return;
        }

        const retryResult = await readSession();

        if (!active) {
          return;
        }

        if (retryResult === 'timeout') {
          console.warn('Viewer session retry timed out; showing public auth content.');
          setSession(null);
          setUser(null);
          setProfile(null);
          setError(null);
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
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      const currentUser = currentSession?.user ?? null;
      setSession(currentSession ?? null);
      setUser(currentUser);

      if (!currentUser) {
        clearPersistedAuthState();
        setPersistedRole(null);
        setProfile(null);
        setError(null);
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      persistAuthenticatedUser(currentUser);
      setPersistedRole(readPersistedAuthState().userRole);
      setError(null);
      hasLoadedViewerRef.current = true;
      setLoading(false);

      const response = await fetch('/api/auth/profile', {
        cache: 'no-store',
        credentials: 'include',
      });
      const body = (await response.json().catch(() => null)) as ProfileResponse | null;

      if (!active) {
        return;
      }

      if (response.status === 401) {
        setProfile(null);
        setError(null);
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
      setError(null);
    };

    void loadViewer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (authRefreshTimerRef.current) {
        window.clearTimeout(authRefreshTimerRef.current);
      }

      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);

      const refreshDelay = event === 'SIGNED_IN' || event === 'SIGNED_OUT' ? 0 : 350;
      authRefreshTimerRef.current = window.setTimeout(() => {
        void loadViewer({ showLoading: false });
      }, refreshDelay);
    });

    return () => {
      active = false;
      if (authRefreshTimerRef.current) {
        window.clearTimeout(authRefreshTimerRef.current);
      }
      subscription.unsubscribe();
    };
  }, [pathname, router, supabase]);

  return {
    authEnabled,
    error,
    hasAccessToken: Boolean(session?.access_token),
    loading,
    profile,
    persistedRole,
    session,
    supabase,
    user,
  };
}

