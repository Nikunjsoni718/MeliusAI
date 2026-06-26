const marketplaceSteps = [
  {
    number: '1.',
    title: 'Developers Build the Proof',
    text: 'Talent uploads raw code to a private, secure vault. No fluffed resumes, just actual architecture.',
  },
  {
    number: '2.',
    title: 'The AI Audits the Logic',
    text: 'The Melius engine scans the work line-by-line, issuing a ruthless, deduction-based score out of 100.',
  },
  {
    number: '3.',
    title: 'Organizations Hire the Signal',
    text: 'Companies bypass the interview noise and directly hire talent backed by undeniable technical truth.',
  },
];

export default function Page() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-24 text-white sm:px-6 lg:px-8">
      <section>
        <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          One Vault. Two Sides. Zero Guesswork.
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-12">
          {marketplaceSteps.map((step) => (
            <article
              key={step.number}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 shadow-[0_20px_70px_rgba(2,6,23,0.32)] backdrop-blur-xl"
            >
              <h2 className="text-left text-xl font-semibold tracking-tight text-white">
                <span className="bg-gradient-to-r from-cyan-300 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(45,212,191,0.28)]">
                  {step.number}
                </span>{' '}
                {step.title}
              </h2>
              <p className="mt-4 text-left text-sm leading-6 text-slate-400">{step.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
