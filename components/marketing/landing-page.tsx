import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const informationBlocks = [
  {
    title: 'Private Vault',
    description:
      'A secure, sovereign home for your raw work. Upload photos of art, code links, or design decks without external judgment.',
  },
  {
    title: 'MeliusAI Audit',
    description:
      'Optionally trigger a deep-logic scan of your work to receive your Verified Score and a "Goods vs. Bads" breakdown.',
  },
  {
    title: 'Customized Roadmap',
    description:
      'Upgrade to Melius+ to receive a tailored step-by-step path to fix your skill gaps and reach the 90+ hiring threshold.',
  },
  {
    title: 'Autonomous Agent',
    description:
      'Once verified, activate MeliusAI to apply for jobs on your behalf. Exclusive launch offer: Get Melius+ FREE for your first year.',
  },
];

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-7xl flex-col px-4 py-0 sm:px-6 lg:px-8">
      <section className="grid flex-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-12">
        <div className="max-w-3xl -mt-6 lg:-mt-12">
          <Badge variant="accent" className="mb-2">Introduction</Badge>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Verify Your Value. Let AI Help You Lead Your Career.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            MeliusIQ is the private career operating system where you build your body of work, trigger MeliusAI when you want intelligence, and automate growth only when the signal is truly ready.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" href="/auth">Sign In &amp; Get Started</Button>
            <Button variant="outline" size="lg" href="/how-it-works">How it Works</Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-5 text-sm">
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

        <Card className="relative overflow-hidden border-sky-500/15 bg-slate-950/85">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">The MeliusIQ Ecosystem</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
      
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-900">
                <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-indigo-400" />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                MeliusAI stays framed as the intelligence layer: scanning logic, exposing signal, and activating only when the operating system has enough proof to move.
              </p>
          
            <div className="grid gap-4 sm:grid-cols-2">
              {informationBlocks.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
