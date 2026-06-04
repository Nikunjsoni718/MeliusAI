import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  {
    step: '01',
    title: 'Vault',
    summary: 'A protected private vault keeps raw links, work samples, and internal AI scrutiny inside authenticated routes.',
    details: [
      'The vault is where MeliusAI stores portfolio signal after sign-in.',
      'This is intentionally separated from the public introduction pages.',
      'Private Vault logic stays inside dashboard workflows, not the marketing shell.',
    ],
  },
  {
    step: '02',
    title: 'Upload',
    summary: 'Users drop GitHub repositories, Behance links, Google Drive folders, or portfolio sites into one universal intake.',
    details: [
      'Profession routing changes how the same input is interpreted.',
      'Developers, designers, marketers, and HR users all enter through the same polished surface.',
      'The goal is proof-first onboarding, not resume-first onboarding.',
    ],
  },
  {
    step: '03',
    title: 'Verify',
    summary: 'MeliusAI translates work into a score, goods vs. bads, a roadmap, and company-specific readiness gaps.',
    details: [
      'Verification focuses on explainable signal instead of vague hype.',
      'The Ready Meter shows exactly what still blocks a target role.',
      'AI Scrutiny remains in the protected dashboard layer where sensitive analysis belongs.',
    ],
  },
  {
    step: '04',
    title: 'Activate',
    summary: 'Once readiness crosses the threshold, the Melius Agent can move a verified portfolio into recruiter hands automatically.',
    details: [
      'Automation is gated behind a 90+ signal, not offered by default.',
      'That keeps the experience ambitious without feeling irresponsible.',
      'Users always understand why they are ready or why they are not yet ready.',
    ],
  },
];

export function HowItWorksPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:p-8">
        <Badge variant="accent">How it Works</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          A four-step flow that moves from private proof to public momentum.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-400">
          Vault, Upload, Verify, and Activate are now their own full-page guide so the product story feels like a real system instead of a stack of disconnected claims.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
          <Card className="border-sky-500/15">
            <CardHeader>
              <CardTitle>Flow principle</CardTitle>
              <CardDescription>
                Public pages introduce the system. Protected routes handle Private Vault and AI Scrutiny where trust actually matters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Public shell for explanation and conversion.',
                'Protected dashboard for stored work and AI analysis.',
                'Automation only after verified readiness.',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {steps.map((item) => (
              <Card key={item.step}>
                <CardContent className="grid gap-5 p-6 md:grid-cols-[84px_1fr]">
                  <div className="mono flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/10 text-lg font-semibold text-sky-300">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{item.title}</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{item.summary}</h2>
                    <div className="mt-4 grid gap-3">
                      {item.details.map((detail) => (
                        <div key={detail} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">
                          {detail}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
