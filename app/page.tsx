import { redirect } from 'next/navigation';

import { LandingPage } from '@/components/marketing/landing-page';
import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

function getProfileHandle(user: {
  id: string;
  raw_user_meta_data?: { username?: string };
  user_metadata?: { username?: string };
}) {
  return user.raw_user_meta_data?.username || user.user_metadata?.username || user.id;
}

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

  if (user) {
    redirect(`/profile/${encodeURIComponent(getProfileHandle(user))}`);
  }

  return <LandingPage />;
}
