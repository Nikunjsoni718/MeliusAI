'use client';

import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { persistAuthenticatedUser } from '@/lib/auth-session-routing';

export type TalentAuthCompletionInput = {
  birthDate?: string | null;
  fullName?: string | null;
  session: Session;
  username?: string | null;
};

type ProfileBootstrapResponse = {
  data?: {
    username?: string | null;
  };
  error?: string;
  profile?: {
    id: string;
    username?: string | null;
  };
  success?: boolean;
};

export async function completeTalentAuthentication({
  birthDate,
  fullName,
  session,
  username,
}: TalentAuthCompletionInput) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  });
  const response = await fetch('/api/auth/profile', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      role: 'talent',
      full_name: fullName,
      username,
      birth_date: birthDate,
    }),
  });
  const body = (await response.json().catch(() => null)) as ProfileBootstrapResponse | null;

  if (!response.ok || !body?.success || !body.profile?.id) {
    throw new Error(body?.error ?? 'Auth succeeded, but profile creation failed. Please try again.');
  }

  persistAuthenticatedUser(session.user);

  const profileHandle =
    body.profile.username ??
    body.data?.username ??
    username ??
    body.profile.id;

  return `/profile/${encodeURIComponent(profileHandle)}`;
}

export function useTalentAuthCompletion() {
  const router = useRouter();

  return useCallback(
    async (input: TalentAuthCompletionInput) => {
      const profileDestination = await completeTalentAuthentication(input);
      router.replace(profileDestination);
      return profileDestination;
    },
    [router]
  );
}
