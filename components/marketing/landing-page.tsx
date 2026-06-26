import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-7xl flex-col px-4 py-0 sm:px-6 lg:px-8">
      <section className="flex flex-col items-start justify-center text-left w-full mt-16 flex-1">
        <div className="max-w-4xl">
          <Badge variant="accent" className="mb-2">
            Introduction
          </Badge>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Verify Your Work. Level Up Your Career.
          </h1>
          <p className="mt-6 mb-10 max-w-2xl text-lg leading-8 text-slate-300">
            Don&apos;t just list your skills. Upload your projects, get an elite AI audit in seconds, and know exactly what to fix before your next big move.
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
      </section>
    </main>
  );
}
