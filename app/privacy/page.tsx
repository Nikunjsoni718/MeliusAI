import type { Metadata } from 'next';

import { PolicySection, PublicPageShell } from '@/components/marketing/public-page-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy | MeliusAI',
  description: 'How MeliusAI collects, processes, and protects account and code-audit data.',
};

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="Privacy"
      title="Privacy Policy"
      description="A clear explanation of the information MeliusAI needs to operate and how we handle it."
    >
      <article className="overflow-hidden rounded-[2rem] border border-slate-800/80 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        <div className="border-b border-slate-800/80 bg-slate-900/40 px-6 py-5 sm:px-10">
          <p className="text-sm text-slate-400">Last updated: 3 October 2026</p>
        </div>

        <PolicySection title="1. Overview">
          <p>
            This Privacy Policy explains how MeliusAI collects, uses, and safeguards information
            when you use our AI-assisted code auditing platform. By using MeliusAI, you acknowledge
            the practices described here.
          </p>
        </PolicySection>

        <PolicySection title="2. Information we collect">
          <p>
            We collect information you provide directly, including your name, email address,
            account settings, support requests, and billing information necessary to process a
            payment. Payment card and UPI details are handled by our payment processors; we do not
            store complete payment credentials on our servers.
          </p>
          <p>
            When you sign in through Google or GitHub OAuth, we may receive your email address,
            display name, profile image, provider account identifier, and other basic profile
            information that the provider makes available and you authorise. For GitHub
            connections, we also process the read-only repository information needed to power the
            features you select.
          </p>
        </PolicySection>

        <PolicySection title="3. How we process code">
          <p>
            MeliusAI processes repository metadata and the code changes or diffs you select for an
            audit. The relevant content may be temporarily sent to carefully selected AI API
            providers solely to generate the requested audit result. We do not retain submitted
            code diffs longer than reasonably necessary to complete the audit, secure the service,
            and resolve operational issues.
          </p>
          <p>
            We do not use your proprietary code to train public AI models. We also do not sell
            your code or make it available to other MeliusAI users. You remain responsible for
            ensuring that you are authorised to submit any code or repository content for audit.
          </p>
        </PolicySection>

        <PolicySection title="4. How we use information">
          <p>We use the information described above to:</p>
          <ul className="list-disc space-y-2 pl-5 marker:text-sky-400">
            <li>Create and secure your account and maintain your session.</li>
            <li>Provide requested repository connections, audits, scorecards, and support.</li>
            <li>Process payments, prevent fraud, and enforce our terms and usage limits.</li>
            <li>Monitor service reliability, investigate abuse, and improve MeliusAI.</li>
            <li>Send essential service, billing, security, and account communications.</li>
          </ul>
        </PolicySection>

        <PolicySection title="5. Cookies and session management">
          <p>
            MeliusAI uses essential cookies supplied by Supabase to manage authentication and keep
            your session secure. These cookies allow us to recognise your signed-in session,
            protect against unauthorised access, and provide account features. They are necessary
            for the service to function and are not used for cross-site advertising.
          </p>
        </PolicySection>

        <PolicySection title="6. Sharing and service providers">
          <p>
            We share information only with service providers that help us operate MeliusAI, such as
            cloud hosting, authentication, payment processing, email delivery, analytics, and AI
            processing providers. They may process information only under appropriate contractual
            or legal safeguards and for the purposes of providing services to us. We may also
            disclose information where required by law or to protect users, MeliusAI, or the public.
          </p>
        </PolicySection>

        <PolicySection title="7. Retention and security">
          <p>
            We retain account, billing, and audit-related information only for as long as needed to
            provide the Services, meet legal obligations, resolve disputes, and enforce agreements.
            We use reasonable technical and organisational measures to protect information, though
            no internet service can guarantee absolute security.
          </p>
        </PolicySection>

        <PolicySection title="8. Your choices">
          <p>
            You may update account information, disconnect GitHub OAuth access through GitHub,
            cancel a subscription, or ask questions about access, correction, or deletion of your
            personal information by contacting us. Some information may need to be retained where
            required for legal, fraud-prevention, or legitimate business purposes.
          </p>
        </PolicySection>

        <PolicySection title="9. Contact us">
          <p>
            For privacy questions or requests, email{' '}
            <a className="text-sky-300 underline decoration-sky-400/40 underline-offset-4 hover:text-sky-200" href="mailto:support@meliusai.in">
              support@meliusai.in
            </a>.
          </p>
        </PolicySection>
      </article>
    </PublicPageShell>
  );
}
