import { HowItWorksTimeline } from '@/components/marketing/how-it-works-timeline';

export default function Page() {
  return (
    <main className="relative min-h-screen px-4 pt-32 text-white sm:px-6 lg:px-8">
      <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">
        One Vault. Deep Audits. Zero Guesswork.
      </h1>
      <HowItWorksTimeline />
    </main>
  );
}
