import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-7xl flex-col px-4 pb-16 pt-32 sm:px-6 lg:px-8">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full flex-1">
        <div className="flex flex-col items-start text-left max-w-4xl">
          <Badge variant="accent" className="mb-2">
            Introduction
          </Badge>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            The Standard for Verified Engineering Talent.
          </h1>
          <p className="mt-6 mb-10 max-w-2xl text-lg leading-8 text-slate-300">
            The private workspace where developers prove their technical depth through line-by-line AI audits, and organizations find the top 1% of hires without the resume guesswork.
          </p>
          <div className="flex flex-row justify-start gap-4 mb-6">
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
            <Button variant="outline" size="lg" href="/melius+">
              Melius+
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
    </main>
  );
}
