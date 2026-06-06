'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const persistedState = readPersistedAuthState();
      setPersistedRole(persistedState.userRole);
    }

    if (!supabase) {
      return;
    }

    let active = true;

    const loadViewer = async () => {
      setLoading(true);

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (userError) {
        setError(userError.message);
        setLoading(false);
        return;
      }

      setUser(currentUser ?? null);

      if (!currentUser) {
        clearPersistedAuthState();
        setPersistedRole(null);
        setProfile(null);
        setError(null);
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
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError(body?.error ?? 'Unable to load profile.');
        setLoading(false);
        return;
      }

      setProfile(body?.data ?? null);
      setError(null);
      setLoading(false);
    };

    void loadViewer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadViewer();
    });

    return () => {
      active = false;
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

