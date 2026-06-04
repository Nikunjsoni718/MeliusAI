import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist_Mono, Inter } from 'next/font/google';

import { AppShell } from '@/components/layout/app-shell';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'MeliusAI | Verify Your Value',
  description:
    'Judgment-free project analysis, verified portfolios, and an AI career agent that turns readiness into action.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
