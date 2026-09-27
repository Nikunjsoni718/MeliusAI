'use client';

import { useState } from 'react';

const oldWayPoints = [
  'Keyword-stuffed PDF resumes that fail to demonstrate actual engineering depth.',
  'Static GitHub repositories with no objective measure of code quality or architecture.',
  'Relying on past company logos rather than undeniable proof of your current skills.',
];

const meliusWayPoints = [
  'Line-by-line AI audits mapping pure architectural logic and best practices.',
  'Evidence-based engineering assessments that prove your exact technical capabilities.',
  'A dynamic, secure profile backed by hard data and verified code metrics.',
];

export default function Page() {
  const [isMeliusWay, setIsMeliusWay] = useState(false);
  const points = isMeliusWay ? meliusWayPoints : oldWayPoints;

  return (
    <main className="min-h-screen px-4 pb-16 pt-32 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Choose Your Ecosystem.</h1>
        <p className="mt-5 text-base leading-7 text-slate-400">
          Compare the old way of building a resume with undeniable technical proof.
        </p>
      </section>

      <div className="flex justify-center mt-12">
        <div
          className="bg-gray-900 border border-gray-800 p-1 rounded-full flex relative w-72 h-12 cursor-pointer"
          role="group"
          aria-label="Compare developer verification paths"
        >
          <span
            className={`bg-cyan-600 rounded-full h-10 w-[140px] absolute transition-all duration-300 ${
              isMeliusWay ? 'translate-x-[140px]' : 'translate-x-0'
            }`}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => setIsMeliusWay(false)}
            className={`flex-1 text-center font-medium z-10 text-sm flex items-center justify-center transition-colors duration-300 ${
              isMeliusWay ? 'text-slate-500' : 'text-white'
            }`}
          >
            The Old Way
          </button>
          <button
            type="button"
            onClick={() => setIsMeliusWay(true)}
            className={`flex-1 text-center font-medium z-10 text-sm flex items-center justify-center transition-colors duration-300 ${
              isMeliusWay ? 'text-white' : 'text-slate-500'
            }`}
          >
            MeliusAI
          </button>
        </div>
      </div>

      <section className="max-w-3xl mx-auto mt-8 bg-gray-900/50 border border-gray-800 rounded-2xl p-8 transition-all duration-500 min-h-[300px] flex flex-col justify-between">
        <div>
          <h2
            className={`text-3xl font-semibold tracking-tight ${
              isMeliusWay
                ? 'bg-gradient-to-r from-cyan-300 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(34,211,238,0.25)]'
                : 'text-white'
            }`}
          >
            {isMeliusWay ? 'The Verified Scorecard' : 'The Traditional Resume'}
          </h2>

          <div className="mt-8 space-y-5">
            {points.map((point) => (
              <div key={point} className="flex gap-4 text-left">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm ${
                    isMeliusWay
                      ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                      : 'border-slate-700 bg-slate-800/60 text-slate-500'
                  }`}
                >
                  {isMeliusWay ? '✓' : '×'}
                </span>
                <p className="text-base leading-7 text-slate-300">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
