import type { Metadata } from 'next';

import { PublicPageShell } from '@/components/marketing/public-page-shell';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions | MeliusAI',
  description: 'Answers to common questions about MeliusAI code audits, privacy, and billing.',
};

const faqs = [
  {
    question: 'What is MeliusAI?',
    answer:
      'MeliusAI is an AI-assisted code auditing platform for developers who want clear, evidence-based feedback on the engineering work in their repositories. It helps turn selected code changes into practical audit insights and scorecards.',
  },
  {
    question: 'How does the incremental audit save compute?',
    answer:
      'Instead of repeatedly scanning an entire repository, an incremental audit focuses on the relevant changes and surrounding context. This reduces duplicate analysis, helps keep audit time and usage efficient, and lets you review the work that changed.',
  },
  {
    question: 'Is my proprietary code safe?',
    answer:
      'We request read-only GitHub access and process only the repository information and code changes needed for the audit you request. Selected diffs may be temporarily sent to AI APIs to generate results, are not used to train public models, and are not stored long-term by MeliusAI.',
  },
  {
    question: 'How does billing work?',
    answer:
      'Plan prices, billing periods, and any usage limits are shown before checkout. Paid access and audit credits are billed in advance through the payment methods available on the checkout page. Consumed API or usage credits are generally non-refundable, subject to applicable law.',
  },
  {
    question: 'Can I cancel my subscription?',
    answer:
      'Yes. You can cancel before your next renewal date to stop future charges. Your paid access remains available through the end of the current billing period, and unused time from that period is generally not refunded.',
  },
  {
    question: 'Can MeliusAI change my repository?',
    answer:
      'No. MeliusAI requests read-only access for connected GitHub repositories. It does not push code, create commits, delete content, or otherwise modify your repository through that connection.',
  },
];

export default function FaqPage() {
  return (
    <PublicPageShell
      eyebrow="Help centre"
      title="Frequently asked questions"
      description="Straightforward answers about audits, repository access, privacy, and billing."
    >
      <div className="overflow-hidden rounded-[2rem] border border-slate-800/80 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        {faqs.map((faq, index) => (
          <details
            key={faq.question}
            className="group border-b border-slate-800/80 px-6 py-1 last:border-b-0 sm:px-10"
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left text-base font-semibold text-white marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950">
              {faq.question}
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg font-normal text-sky-300 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="max-w-3xl pb-6 text-sm leading-7 text-slate-400 sm:text-[15px]">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </PublicPageShell>
  );
}
