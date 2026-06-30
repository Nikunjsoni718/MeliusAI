import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const betaMetrics = [
  { value: '127+', label: 'Projects Audited' },
  { value: '34+', label: 'Active Beta Builders' },
  { value: '2,400+', label: 'Structure Reviews Generated' },
];

const auditStrengths = [
  ['Clean Architecture', 'Proper structural separation of concerns.'],
  ['Good API Design', 'Strict RESTful standards followed.'],
];

const auditWeaknesses = [
  ['Missing Error Handling', 'Missing catch-block logging routines in /api/v1/auth.'],
  ['Weak Input Validation', 'Zod schema parameters lack strict boundary constraints on user payloads.'],
];

export function LandingPage() {
  return (
    <main
      id="introduction"
      className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-10 pt-32 sm:px-6 lg:px-8"
    >
      <section className="grid min-h-[calc(100vh-8rem)] grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col items-start text-left max-w-4xl">
          <Badge variant="accent" className="mb-2">
            Introduction
          </Badge>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            The Standard for Verified Talent.
          </h1>
          <p className="mt-6 mb-6 max-w-2xl text-lg leading-8 text-slate-300">
            The private workspace where developers prove their technical depth through line-by-line AI audits, and organizations find the top 1% of hires without the resume guesswork.
          </p>
          <div className="flex flex-row justify-start gap-4 mb-4">
            <Button size="lg" href="/auth">
              Sign In &amp; Get Started
            </Button>
            <Button variant="outline" size="lg" href="/how-it-works">
              How it Works
            </Button>
          </div>
          <div className="flex flex-wrap justify-start gap-3">
            <Button variant="outline" size="lg" href="/difference">
              What makes us different
            </Button>
            <Button variant="outline" size="lg" href="/about-us">
              About us
            </Button>
          </div>
        </div>

        <div className="relative w-full">
          <div className="relative rounded-xl border border-gray-800 bg-gray-900/50 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl">
            <div className="flex items-center gap-2 border-b border-gray-800 px-5 py-4">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
            </div>
            <pre className="overflow-x-auto px-5 py-6 text-left text-sm leading-7 text-slate-300">
              <code>
                <span className="text-fuchsia-300">import</span>
                <span className="text-slate-300"> asyncio</span>
                {'\n\n'}
                <span className="text-fuchsia-300">async def</span>
                <span className="text-sky-300"> fetch_data</span>
                <span className="text-slate-300">():</span>
                {'\n'}
                <span className="text-slate-500">  # AI scanning architecture...</span>
                {'\n'}
                <span className="text-slate-300">  payload = </span>
                <span className="text-emerald-300">await</span>
                <span className="text-sky-300"> collect_signal</span>
                <span className="text-slate-300">()</span>
                {'\n'}
                <span className="text-slate-300">  score = </span>
                <span className="text-sky-300">audit_engine</span>
                <span className="text-slate-300">(payload)</span>
                {'\n'}
                <span className="text-fuchsia-300">  return</span>
                <span className="text-slate-300"> score</span>
              </code>
            </pre>
          </div>
          <div className="absolute -bottom-6 -right-6 rounded-full border border-teal-300/40 bg-slate-950/90 px-5 py-3 shadow-[0_0_34px_rgba(45,212,191,0.22)]">
            <p className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-sm font-semibold text-transparent">
              AI Audit Score: 94/100
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 border-y border-neutral-900 py-6 sm:grid-cols-3">
        {betaMetrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-neutral-800 bg-neutral-950/45 px-5 py-5 text-center backdrop-blur-md"
          >
            <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{metric.value}</p>
            <p className="mt-2 text-sm font-medium text-neutral-400">{metric.label}</p>
          </div>
        ))}
      </section>

      <section className="py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Badge variant="outline">Real Audit Preview</Badge>
            <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              See the exact review signal recruiters and builders can trust.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-neutral-400">
              MeliusAI turns uploaded work into a structured technical audit: strengths, weaknesses, scoring, and practical recommendations without vague resume claims.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#050814]/85 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-neutral-800 bg-neutral-950/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">repository</p>
                <p className="mt-1 truncate font-mono text-sm text-neutral-200">e-commerce-backend-api</p>
              </div>
              <div className="w-fit rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                89/100
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Strengths</p>
                <div className="mt-4 space-y-4">
                  {auditStrengths.map(([title, description]) => (
                    <div key={title}>
                      <p className="text-sm font-semibold text-white">✅ {title}</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-400">{description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">Weaknesses</p>
                <div className="mt-4 space-y-4">
                  {auditWeaknesses.map(([title, description]) => (
                    <div key={title}>
                      <p className="text-sm font-semibold text-white">❌ {title}</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-400">{description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-800 bg-sky-500/[0.06] px-5 py-5">
              <p className="text-sm leading-7 text-sky-100">
                <span className="font-semibold text-white">Recommendation:</span> Strengthen token authentication layer variables and handle specific edge cases in route handlers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-4 pt-6">
        <div className="rounded-[2rem] border border-neutral-800 bg-neutral-950/70 px-6 py-12 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-10 sm:py-16">
          <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Ready to back up your resume with real, audited code?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg">
            Join our active beta. Start running instant AI audits and build your verified technical capability profile today.
          </p>
          <Button
            href="/auth"
            size="lg"
            className="group mt-8 bg-[#00a3ff] px-7 font-semibold text-black hover:bg-[#38bdf8]"
          >
            Start Free Audits
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Button>
        </div>
      </section>
    </main>
  );
}
