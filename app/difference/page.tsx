const oldWayLines = [
  'const screening = "Keyword-stuffed PDF resumes"',
  'const feedback = null // Ghosted after take-home assignment',
  'const process_time = "3 to 5 weeks"',
];

const meliusWayLines = [
  'const screening = await melius.audit(raw_architecture)',
  'const feedback = generate_granular_score(94, 100)',
  'const process_time = "Instant"',
];

export default function Page() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-32 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          The system is broken. We built the patch.
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-400">
          Stop dealing with outdated hiring loops. Here is the diff.
        </p>
      </section>

      <section className="bg-[#0d1117] rounded-xl border border-gray-800 max-w-4xl mx-auto mt-12 overflow-hidden shadow-2xl font-mono text-sm md:text-base">
        <div className="bg-gray-900 px-4 py-3 border-b border-gray-800 flex gap-2">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
        </div>

        <div>
          {oldWayLines.map((line) => (
            <div
              key={line}
              className="bg-red-900/20 text-red-400 border-l-4 border-red-500 px-4 py-3 flex gap-4"
            >
              <span className="w-4 shrink-0">-</span>
              <code>{line}</code>
            </div>
          ))}

          {meliusWayLines.map((line) => (
            <div
              key={line}
              className="bg-green-900/20 text-green-400 border-l-4 border-green-500 px-4 py-3 flex gap-4"
            >
              <span className="w-4 shrink-0">+</span>
              <code>{line}</code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
