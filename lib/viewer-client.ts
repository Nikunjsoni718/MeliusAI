'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import {
  clearPersistedAuthState,
  persistAuthenticatedUser,
  readPersistedAuthState,
  type PersistedUserRole,
} from '@/lib/auth-session-routing';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';
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
  data?: ViewerProfile;
  error?: string;
};

export function getDashboardHref(role: UserRow['role']) {
  return role === 'recruiter' ? '/company' : '/home';
}

export function useViewerProfile() {
  const authEnabled = hasSupabaseBrowserEnv();
  const [supabase] = useState<ReturnType<typeof createSupabaseBrowserClient> | null>(() => {
    return authEnabled ? createSupabaseBrowserClient() : null;
  });
  const [loading, setLoading] = useState(authEnabled);
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

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (userError) {
        setError(userError.message);
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      setUser(currentUser ?? null);

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

      const response = await fetch('/api/auth/profile', { cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as ProfileResponse | null;

      if (!active) {
        return;
      }

      if (response.status === 401) {
        setProfile(null);
        setError(null);
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError(body?.error ?? 'Unable to load profile.');
        hasLoadedViewerRef.current = true;
        setLoading(false);
        return;
      }

      setProfile(body?.data ?? null);
      setError(null);
      hasLoadedViewerRef.current = true;
      setLoading(false);
    };

    void loadViewer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (authRefreshTimerRef.current) {
        window.clearTimeout(authRefreshTimerRef.current);
      }

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
  }, [supabase]);

  return {
    authEnabled,
    error,
    loading,
    profile,
    persistedRole,
    supabase,
    user,
  };
}

