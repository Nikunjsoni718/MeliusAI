function ResumeSkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-800/50 ${className}`} />;
}

export function ResumeTopProjectsSkeleton() {
  return (
    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Loading top projects">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="rounded-md border border-slate-800 bg-[#0B1021] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <ResumeSkeletonBlock className="h-4 w-3/4" />
              <ResumeSkeletonBlock className="h-3 w-1/2" />
            </div>
            <ResumeSkeletonBlock className="h-4 w-12" />
          </div>
          <div className="mt-5 flex gap-2">
            <ResumeSkeletonBlock className="h-6 w-20 rounded-full" />
            <ResumeSkeletonBlock className="h-6 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResumeContentSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-8 pt-16 sm:px-6 sm:py-8"
      aria-busy="true"
      aria-label="Loading developer profile"
    >
          <div className="mb-8 space-y-4">
            <ResumeSkeletonBlock className="h-3 w-44" />
            <ResumeSkeletonBlock className="h-10 w-64" />
            <ResumeSkeletonBlock className="h-4 w-full max-w-2xl" />
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md">
              <ResumeSkeletonBlock className="mb-5 h-3 w-32" />
              <div className="flex flex-col gap-6 sm:flex-row">
                <ResumeSkeletonBlock className="h-20 w-20 shrink-0 rounded-full" />
                <div className="grid flex-1 gap-4 sm:grid-cols-2">
                  <ResumeSkeletonBlock className="h-12 w-full sm:col-span-2" />
                  <ResumeSkeletonBlock className="h-10 w-full" />
                  <ResumeSkeletonBlock className="h-10 w-full" />
                </div>
              </div>
            </div>

            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md">
                <ResumeSkeletonBlock className="h-3 w-32" />
                <div className="mt-5 space-y-3">
                  <ResumeSkeletonBlock className="h-4 w-full" />
                  <ResumeSkeletonBlock className="h-4 w-4/5" />
                </div>
              </div>
            ))}

            <div className="rounded-md border border-slate-800 bg-slate-950/50 p-6">
              <ResumeSkeletonBlock className="h-3 w-28" />
              <ResumeTopProjectsSkeleton />
            </div>
          </div>
    </div>
  );
}

export function ResumePageSkeleton() {
  return (
    <main className="flex min-h-[100dvh] bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-white">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0A0F1C]/70 p-4 md:flex md:flex-col md:justify-between">
        <div>
          <div className="flex items-center gap-3 px-3 py-2">
            <ResumeSkeletonBlock className="h-9 w-9 rounded-xl" />
            <div className="space-y-2">
              <ResumeSkeletonBlock className="h-4 w-20" />
              <ResumeSkeletonBlock className="h-3 w-14" />
            </div>
          </div>
          <div className="mt-8 space-y-2">
            {[0, 1, 2, 3].map((item) => (
              <ResumeSkeletonBlock key={item} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <ResumeSkeletonBlock className="h-16 w-full" />
      </aside>
      <section className="min-w-0 flex-1 overflow-hidden">
        <ResumeContentSkeleton />
      </section>
    </main>
  );
}
