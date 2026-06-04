import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:p-8">
        <Badge variant="outline">About Us</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          We believe this generation deserves better than static resumes and generic career advice.
        </h1>
        <div className="mt-8 grid gap-5">
          {[
            'MeliusAI starts from a simple belief: proof of work should travel farther than self-description. The current generation builds in public, learns across formats, and ships outside traditional pathways. Career infrastructure has not caught up to that reality.',
            'The platform is designed to read evidence with empathy. It should tell users what is strong, what is weak, and what to do next without reducing them to a number with no context. That is why the product keeps explanation, readiness, and action together in one system.',
            'Long term, the vision is bigger than scoring. MeliusAI should become an operating layer for early-career momentum: a private vault for work, a verification engine for signal, a recruiter-facing portfolio packet, and an automation layer that acts only when the evidence is real.',
          ].map((paragraph, index) => (
            <Card key={index}>
              <CardContent className="p-6 text-base leading-8 text-slate-300">
                {paragraph}
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="mt-6 border-sky-500/15">
          <CardHeader>
            <CardTitle>The potential of the current generation</CardTitle>
          </CardHeader>
          <CardContent className="text-base leading-8 text-slate-300">
            Today&apos;s builders are already creating the proof recruiters say they want. The missing piece is a system that can verify it, narrate it, and route it into opportunity with more precision and less gatekeeping. That is the future MeliusAI is trying to build.
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
