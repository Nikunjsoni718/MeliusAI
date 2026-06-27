"use client";

import Image from 'next/image';
import React from 'react';
import { useRouter } from 'next/navigation';

import faviconLogo from '@/app/favicon.png';
import { SessionRouteGuard } from '@/components/auth/session-route-guard';

const talentRows = ['Save your projects', 'Get a clear review', 'Grow step by step'];
const organisationRows = ['See reviewed talent', 'Keep hiring organized', 'Use your work domain'];

export default function MeliusAIWorkspaceSelector() {
  const router = useRouter();

  return (
    <SessionRouteGuard>
    <div className="min-h-screen bg-[#030512] text-slate-100 px-5 py-10 md:px-12 flex flex-col items-center justify-center font-[var(--font-sans)] select-none relative overflow-hidden">
      <div className="absolute top-[-20%] left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-purple-500/5 blur-[150px] pointer-events-none" />
      <div className="absolute top-[-8%] left-1/2 h-[360px] w-[560px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex w-full max-w-5xl flex-1 flex-col items-center justify-center">
        <section className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#1e293b] bg-gradient-to-b from-[#13162f] to-[#080a1a] shadow-2xl shadow-slate-950/40">
            <Image src={faviconLogo} alt="MeliusAI Logo" width={40} height={40} className="object-contain" />
          </div>

          <span className="mt-5 rounded-full border border-slate-800/80 bg-[#11142e]/40 px-3.5 py-1 text-[10px] font-medium tracking-wide text-slate-400">
            Welcome
          </span>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Join MeliusAI</h1>
          <p className="mt-4 text-sm font-medium tracking-wide text-slate-400">Choose how you want to sign in.</p>
        </section>

        <section className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push('/auth/login')}
            className="group relative flex min-h-[430px] flex-col justify-between overflow-hidden rounded-[24px] border border-slate-800/50 bg-gradient-to-br from-[#0f1e36] via-[#070b1e] to-[#030512] p-6 text-left shadow-2xl shadow-slate-950/40 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:border-cyan-500/40 md:p-7"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-cyan-400/10" />

            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full border border-cyan-700/40 bg-cyan-950/35 px-3 py-1 text-[10px] font-bold tracking-wide text-cyan-300">
                Elite Talent
              </span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-[#050714] text-sm font-bold text-slate-500 transition-colors group-hover:border-cyan-500/25 group-hover:text-cyan-300">
                1
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Individual Talent</h2>
              <p className="mt-3 text-sm font-medium leading-relaxed tracking-wide text-slate-400">
                Save your work. Get clear feedback. Grow faster.
              </p>
            </div>

            <div className="space-y-2.5">
              {talentRows.map((row) => (
                <div
                  key={row}
                  className="w-full rounded-xl border border-slate-800/70 bg-[#050714] px-4 py-3 text-xs font-medium text-slate-400 transition-colors group-hover:text-slate-300"
                >
                  {row}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/45 pt-4 text-xs font-bold">
              <span className="text-cyan-400">For your work</span>
              <span className="text-slate-500">Choose this path</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push('/auth/organization')}
            className="group relative flex min-h-[430px] flex-col justify-between overflow-hidden rounded-[24px] border border-slate-800/50 bg-gradient-to-br from-[#191336] via-[#070a1e] to-[#030512] p-6 text-left shadow-2xl shadow-slate-950/40 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:border-purple-500/45 md:p-7"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-purple-400/10" />

            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full border border-purple-700/40 bg-purple-950/35 px-3 py-1 text-[10px] font-bold tracking-wide text-purple-300">
                Verified Partner
              </span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-[#050414] text-sm font-bold text-slate-500 transition-colors group-hover:border-purple-500/25 group-hover:text-purple-300">
                2
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Verified Organisation</h2>
              <p className="mt-3 text-sm font-medium leading-relaxed tracking-wide text-slate-400">
                Find reviewed talent. Hire with more confidence.
              </p>
            </div>

            <div className="space-y-2.5">
              {organisationRows.map((row) => (
                <div
                  key={row}
                  className="w-full rounded-xl border border-slate-800/70 bg-[#050414] px-4 py-3 text-xs font-medium text-slate-400 transition-colors group-hover:text-slate-300"
                >
                  {row}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/45 pt-4 text-xs font-bold">
              <span className="text-purple-400">For hiring teams</span>
              <span className="text-slate-500">Choose this path</span>
            </div>
          </button>
        </section>

        <div className="mt-7 text-center">
          <p className="text-xs font-medium text-slate-500">
            Hiring for a company?{' '}
            <button
              type="button"
              onClick={() => router.push('/auth/organization')}
              className="cursor-pointer font-bold tracking-wide text-cyan-500 transition-colors hover:text-cyan-400"
            >
              Access Corporate Console →
            </button>
          </p>
        </div>
      </main>

      <footer className="relative z-10 mt-8 flex w-full max-w-5xl items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-700">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-800 bg-[#050714] text-slate-500">
          N
        </div>
        <span>MELIUSAI PROTECTED NODE</span>
      </footer>
    </div>
    </SessionRouteGuard>
  );
}
