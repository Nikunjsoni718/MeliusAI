import { redirect } from 'next/navigation';

import { AuthPage } from '@/components/auth/auth-page';
import { getAuthenticatedDestination, getUserMetadataRole } from '@/lib/auth-session-routing';
import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

async function readSignedInUser() {
  if (!hasSupabaseServerEnv()) {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export default async function Page() {
  const user = await readSignedInUser();

  if (user && getUserMetadataRole(user)) {
    redirect(getAuthenticatedDestination(user));
  }

  return <AuthPage initialMode="signup" />;
}
