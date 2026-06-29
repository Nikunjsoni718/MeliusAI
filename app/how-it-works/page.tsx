function PrivateVaultMockup() {
  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.36)]">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Private Vault</p>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
          Secure
        </span>
      </div>
      <div className="space-y-3">
        {['app.tsx', 'main.py', 'utils.ts'].map((file) => (
          <div key={file} className="flex items-center gap-3 rounded-xl bg-slate-900/70 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 font-mono text-xs text-cyan-200">
              {'</>'}
            </span>
            <p className="text-sm font-medium text-white">{file}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiEngineMockup() {
  return (
    <div className="relative w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.36)]">
      <div className="absolute right-6 top-6 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2">
        <p className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-sm font-bold text-transparent">
          94/100
        </p>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">AI Engine</p>
      <div className="mt-10 space-y-4 font-mono text-sm">
        <div className="h-2 w-11/12 rounded-full bg-cyan-300/50" />
        <div className="h-2 w-8/12 rounded-full bg-slate-700" />
        <div className="h-2 w-10/12 rounded-full bg-blue-300/45" />
        <div className="h-2 w-7/12 rounded-full bg-slate-700" />
      </div>
      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm leading-6 text-slate-300">
        Deducting exact points for race conditions, missing guards, and weak type boundaries.
      </div>
    </div>
  );
}

function VerifiedProfileMockup() {
  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.36)]">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-300/10 text-3xl text-cyan-200 shadow-[0_0_34px_rgba(34,211,238,0.2)]">
          ✓
        </div>
        <div>
          <p className="text-lg font-semibold text-white">Verified Profile</p>
          <p className="text-sm text-slate-500">Signal-backed candidate</p>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { label: 'Logic', value: '92/100' },
          { label: 'Marks', value: '94/100' },
          { label: 'Compatibility', value: '89%' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center">
            <p className="text-xs text-slate-500">{metric.label}</p>
            <p className="mt-2 text-sm font-semibold text-cyan-200">{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen px-4 pt-32 text-white sm:px-6 lg:px-8">
      <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">
        One Vault. Two Sides. Zero Guesswork.
      </h1>

      <div className="flex flex-col gap-y-32 py-24 max-w-6xl mx-auto">
        <section className="flex flex-col md:flex-row items-center gap-12">
          <div className="w-full text-left md:w-1/2">
            <h2 className="text-4xl font-bold tracking-tight text-white lg:text-5xl">
              1. Developers Build the Proof
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-400">
              Talent uploads raw code to a private, secure vault. No fluffed resumes, just actual architecture.
            </p>
          </div>
          <div className="w-full md:w-1/2">
            <PrivateVaultMockup />
          </div>
        </section>

        <section className="flex flex-col md:flex-row-reverse items-center gap-12">
          <div className="w-full text-left md:w-1/2">
            <h2 className="text-4xl font-bold tracking-tight text-white lg:text-5xl">
              2. The AI Audits the Logic
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-400">
              The Melius engine scans the work line-by-line, issuing a ruthless, deduction-based score out of 100.
            </p>
          </div>
          <div className="w-full md:w-1/2">
            <AiEngineMockup />
          </div>
        </section>

        <section className="flex flex-col md:flex-row items-center gap-12">
          <div className="w-full text-left md:w-1/2">
            <h2 className="text-4xl font-bold tracking-tight text-white lg:text-5xl">
              3. Organizations Hire the Signal
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-400">
              Companies bypass the interview noise and directly hire talent backed by undeniable technical truth.
            </p>
          </div>
          <div className="w-full md:w-1/2">
            <VerifiedProfileMockup />
          </div>
        </section>
      </div>
    </main>
  );
}
