import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';

type PublicPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function PublicPageShell({
  eyebrow,
  title,
  description,
  children,
}: PublicPageShellProps) {
  return (
    <>
      <main className="relative min-h-screen overflow-hidden px-4 pb-8 pt-36 sm:px-6 lg:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_62%)]"
        />
        <section className="mx-auto w-full max-w-4xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/80">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {title}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              {description}
            </p>
          </div>
          <div className="mt-12">{children}</div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

type PolicySectionProps = {
  title: string;
  children: ReactNode;
};

export function PolicySection({ title, children }: PolicySectionProps) {
  return (
    <section className="border-b border-slate-800/80 px-6 py-8 last:border-b-0 sm:px-10">
      <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-400 sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}
