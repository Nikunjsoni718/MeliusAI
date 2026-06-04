export default function SettingsPage() {
  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] px-6 text-white">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" />
      <section className="relative z-10 w-full max-w-4xl rounded-2xl border border-blue-950/50 bg-[#090d1f]/40 p-8 backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-400">Settings</p>
        <h1 className="mt-4 text-3xl font-semibold">Workspace configuration</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          Account preferences and system controls will be available here.
        </p>
      </section>
    </main>
  );
}
