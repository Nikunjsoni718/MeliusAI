import { redirect } from 'next/navigation';

import { getAuthenticatedDestination } from '@/lib/auth-session-routing';
import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export default async function ProfileRedirectPage() {
  if (!hasSupabaseServerEnv()) {
    redirect('/auth/login');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  redirect(getAuthenticatedDestination(user));
}
