import { Suspense } from 'react';

import { ProfileDashboard } from '@/components/dashboard/profile-dashboard';

function ProfilePageFallback() {
  return (
    <main className="flex min-h-screen bg-[#030512] text-slate-300">
      <aside className="hidden w-72 border-r border-slate-900/80 bg-[#050814]/95 p-6 md:block">
        <div className="h-10 w-36 animate-pulse rounded-xl bg-white/10" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-11 animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
        </div>
      </aside>
      <section className="flex flex-1 items-start p-4 pt-16 md:p-8">
        <div className="w-full rounded-[2rem] border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md">
          <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" />
          <div className="mt-6 h-8 w-64 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-4 h-4 w-full max-w-xl animate-pulse rounded bg-white/[0.07]" />
        </div>
      </section>
    </main>
  );
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  return (
    <Suspense fallback={<ProfilePageFallback />}>
      <ProfileDashboard profileUsername={decodeURIComponent(username)} />
    </Suspense>
  );
}
