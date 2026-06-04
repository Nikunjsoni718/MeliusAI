import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="px-4 pb-8 pt-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-8 rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">MeliusIQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            A career operating system powered by MeliusAI when intelligence is needed.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            Private vaults, explainable verification, company-specific readiness, and agentic growth workflows without static-resume guesswork.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Explore</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300">
              <Link href="/how-it-works" className="transition hover:text-white">How it Works</Link>
              <Link href="/difference" className="transition hover:text-white">Difference</Link>
              <Link href="/melius+" className="transition hover:text-white">Melius+</Link>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Protected workspace</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Private Vault and AI Scrutiny remain inside the authenticated dashboard routes.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
