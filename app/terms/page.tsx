import type { Metadata } from 'next';

import { PolicySection, PublicPageShell } from '@/components/marketing/public-page-shell';

export const metadata: Metadata = {
  title: 'Terms of Service | MeliusAI',
  description: 'Terms governing use of the MeliusAI AI-assisted code auditing platform.',
};

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="Legal"
      title="Terms of Service"
      description="The terms that govern your use of MeliusAI and its AI-assisted code auditing services."
    >
      <article className="overflow-hidden rounded-[2rem] border border-slate-800/80 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        <div className="border-b border-slate-800/80 bg-slate-900/40 px-6 py-5 sm:px-10">
          <p className="text-sm text-slate-400">Last updated: 3 October 2026</p>
        </div>

        <PolicySection title="1. Acceptance of these terms">
          <p>
            These Terms of Service govern your access to and use of MeliusAI, including our
            website, workspace, code auditing features, and related services (collectively, the
            “Services”). By creating an account or using the Services, you agree to these terms.
            If you use the Services for an organisation, you confirm that you are authorised to
            accept these terms on its behalf.
          </p>
        </PolicySection>

        <PolicySection title="2. The Services">
          <p>
            MeliusAI provides AI-assisted tools that help users review code changes, understand
            engineering signals, and generate audit insights. The Services are informational and
            assistive only. They do not replace your own technical review, security testing,
            professional judgement, or legal and compliance obligations.
          </p>
        </PolicySection>

        <PolicySection title="3. User obligations">
          <p>When using MeliusAI, you agree to:</p>
          <ul className="list-disc space-y-2 pl-5 marker:text-sky-400">
            <li>Provide accurate account and billing information and keep it up to date.</li>
            <li>
              Use the Services only for repositories, code, and data that you are authorised to
              access and submit for review.
            </li>
            <li>
              Protect your account credentials and promptly notify us of suspected unauthorised
              access.
            </li>
            <li>
              Not misuse the Services, attempt to bypass limits or security controls, interfere
              with other users, or use the Services in violation of applicable law.
            </li>
          </ul>
        </PolicySection>

        <PolicySection title="4. GitHub OAuth access">
          <p>
            If you connect a GitHub account, MeliusAI requests only the read-only repository
            access needed to display repository information and analyse the code or diffs you
            choose to audit. We do not use GitHub OAuth access to write to, modify, delete, push
            to, or otherwise change your repositories. You may revoke MeliusAI&apos;s GitHub access
            at any time through your GitHub account settings; doing so may limit related features
            until you reconnect.
          </p>
        </PolicySection>

        <PolicySection title="5. Payments, subscriptions, and refunds">
          <p>
            Paid plans, subscriptions, and usage credits must be paid in advance through the
            payment methods made available at checkout. Prices, taxes, billing periods, and any
            applicable usage limits are shown before payment is completed.
          </p>
          <p>
            Except where required by applicable law or expressly stated otherwise in writing,
            payments for consumed API, audit, or usage credits are non-refundable. Unused
            subscription time is not refundable after cancellation, but you will retain access to
            paid features until the end of the current paid billing period. You are responsible for
            cancelling before the next renewal date if you do not want your subscription to renew.
          </p>
        </PolicySection>

        <PolicySection title="6. Intellectual property and feedback">
          <p>
            You retain ownership of your code and other content. You grant us the limited right to
            process that content solely to provide, secure, and improve the Services for you.
            MeliusAI and its underlying software, branding, and service content remain our or our
            licensors&apos; property. If you send feedback, you allow us to use it without
            restriction or compensation.
          </p>
        </PolicySection>

        <PolicySection title="7. Availability and changes">
          <p>
            We aim to keep the Services available and useful, but do not guarantee uninterrupted,
            error-free, or fully secure operation. We may modify, suspend, or discontinue features
            when reasonably necessary, including for maintenance, security, legal compliance, or
            product improvements.
          </p>
        </PolicySection>

        <PolicySection title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by law, MeliusAI and its affiliates, officers,
            employees, and suppliers will not be liable for indirect, incidental, special,
            consequential, exemplary, or punitive damages, or for lost profits, revenue, data,
            goodwill, or business opportunity arising from or related to the Services. Our total
            liability for any claim related to the Services will not exceed the amount you paid to
            MeliusAI for the Services in the three months immediately before the event giving rise
            to the claim.
          </p>
        </PolicySection>

        <PolicySection title="9. Governing law and jurisdiction">
          <p>
            These terms are governed by the laws of India. Subject to applicable law, the courts
            in Haryana, India will have exclusive jurisdiction over disputes arising out of or in
            connection with these terms or the Services.
          </p>
        </PolicySection>

        <PolicySection title="10. Contact us">
          <p>
            Questions about these terms can be sent to{' '}
            <a className="text-sky-300 underline decoration-sky-400/40 underline-offset-4 hover:text-sky-200" href="mailto:support@meliusai.in">
              support@meliusai.in
            </a>.
          </p>
        </PolicySection>
      </article>
    </PublicPageShell>
  );
}
