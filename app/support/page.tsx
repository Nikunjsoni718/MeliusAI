import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PublicPageShell } from '@/components/marketing/public-page-shell';

export const metadata: Metadata = {
  title: 'Contact & Support | MeliusAI',
  description: 'Get help with your MeliusAI account, audits, billing, or repository connection.',
};

export default function SupportPage() {
  return (
    <PublicPageShell
      eyebrow="Support"
      title="How can we help?"
      description="Contact our team for help with your account, repository connection, audit results, or billing."
    >
      <Card className="mx-auto max-w-2xl">
        <CardHeader className="p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300/80">
            Contact MeliusAI
          </p>
          <CardTitle className="pt-2 text-2xl sm:text-3xl">Talk to our support team</CardTitle>
          <CardDescription className="max-w-xl pt-1 text-[15px] leading-7">
            Include the email address on your account and a short description of the issue so we
            can help efficiently. Please do not send passwords, API keys, or other secrets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-8 pt-0 sm:p-10 sm:pt-0">
          <a
            href="mailto:support@meliusai.in"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-sky-500/25 bg-sky-500/[0.07] p-5 transition hover:border-sky-400/50 hover:bg-sky-500/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <span>
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Official support email
              </span>
              <span className="mt-2 block text-lg font-semibold text-sky-200 group-hover:text-sky-100">
                support@meliusai.in
              </span>
            </span>
            <span aria-hidden="true" className="text-xl text-sky-300">→</span>
          </a>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <p className="text-sm font-medium text-white">Expected response time</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              We aim to respond within 24–48 business hours. Complex technical or billing matters
              may require additional review, but we will keep you informed.
            </p>
          </div>
          <p className="text-center text-sm leading-6 text-slate-500">
            Looking for a quick answer? Visit our{' '}
            <Link className="text-sky-300 hover:text-sky-200" href="/faq">
              frequently asked questions
            </Link>.
          </p>
        </CardContent>
      </Card>
    </PublicPageShell>
  );
}
