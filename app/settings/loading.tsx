export default function SettingsLoading() {
  return (
    <main className="min-h-[100dvh] bg-slate-950 px-3 py-8 text-slate-200 sm:px-6">
      <div className="max-w-6xl w-[85%] mx-auto mt-12 flex min-h-[75vh] max-h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border border-slate-800 bg-[#0B1021] shadow-2xl">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-slate-800 bg-[#0B1021] sm:w-64">
          <div className="border-b border-slate-800 px-5 py-5">
            <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-3 h-6 w-28 animate-pulse rounded-md bg-slate-800/50" />
          </div>
          <div className="space-y-2 px-3 py-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-md bg-slate-800/50" />
            ))}
          </div>
        </aside>
        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
          <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
          <div className="mt-4 h-9 w-64 animate-pulse rounded-md bg-slate-800/50" />
          <div className="mt-8 h-44 animate-pulse rounded-md border border-slate-800 bg-slate-950" />
        </div>
      </div>
    </main>
  );
}
