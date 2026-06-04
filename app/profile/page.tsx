import { redirect } from 'next/navigation';

import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

function getProfileHandle(user: {
  id: string;
  raw_user_meta_data?: { username?: string };
  user_metadata?: { username?: string };
}) {
  return user.raw_user_meta_data?.username || user.user_metadata?.username || user.id;
}

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

  redirect(`/profile/${encodeURIComponent(getProfileHandle(user))}`);
}
