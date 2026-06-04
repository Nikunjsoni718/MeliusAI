import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DifferencePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:p-8">
        <Badge variant="creative">What makes us different</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Verified Logic beats static resumes when careers are built from proof.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-400">
          This page uses a Bento Grid style to separate MeliusAI from resume theater, generic scoreboards, and one-size-fits-all advice platforms.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-2 lg:row-span-2 border-sky-500/15">
            <CardHeader>
              <Badge variant="accent" className="w-fit">Verified Logic</Badge>
              <CardTitle className="text-3xl">Explainable, proof-first, and tied to real work.</CardTitle>
              <CardDescription className="text-base leading-7">
                MeliusAI evaluates projects, artifacts, and portfolio signal directly, then shows goods, bads, and readiness in plain language.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                'Project evidence before profile claims.',
                'Readable strengths and weaknesses before outreach.',
                'Automation only after a threshold is earned.',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">{item}</div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Badge variant="outline" className="w-fit">Static Resumes</Badge>
              <CardTitle>Claim-heavy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-400">Traditional resumes ask recruiters to believe narrative without enough attached proof.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Badge variant="outline" className="w-fit">Static Resumes</Badge>
              <CardTitle>Low context</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-400">They rarely show what is good, what is weak, and what should be improved next.</p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <Badge variant="creative" className="w-fit">Bento comparison</Badge>
              <CardTitle>Signal you can route versus text you have to interpret.</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                <p className="text-sm font-medium text-white">MeliusAI</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Goods, bads, roadmap, company gaps, and protected scrutiny all live in one system.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                <p className="text-sm font-medium text-white">Static resume</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">One document tries to serve every job target and every reviewer at once.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
