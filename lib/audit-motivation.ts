function normalizeAuditScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

export function getMotivationalMessage(score: number) {
  const normalizedScore = normalizeAuditScore(score);

  if (normalizedScore >= 90) {
    return 'Outstanding work! 🌟 Your architecture is exceptionally clean and production-ready. You earned these bragging rights—hit share! 🚀';
  }

  if (normalizedScore >= 80) {
    return 'Great code! 👏 You are just a few minor tweaks away from that 90+ bracket. Fix the bugs, re-audit, and claim your bragging rights! 🔄';
  }

  if (normalizedScore >= 70) {
    return 'Solid effort! 👍 The foundation is definitely there. Implement a few of the suggested refactors below and you will see a massive jump in your score. 📈';
  }

  if (normalizedScore >= 50) {
    return 'Good start, but there is room to grow. 🌱 Focus on the core logic and security fixes highlighted below to drastically improve your next audit. 🛠️';
  }

  return "Every great project starts with a rough draft! 📝 Read the roast, tackle the critical fixes first, and let's see how much you improve on the next run. 💪";
}

export function getShareText(score: number) {
  const normalizedScore = normalizeAuditScore(score);
  const displayedScore = Math.round(normalizedScore);

  if (normalizedScore >= 90) {
    return `I just scored a top-tier ${displayedScore}/100 on my code architecture using MeliusAI! 🏆 Think your code can beat mine? Check it out:`;
  }

  if (normalizedScore >= 70) {
    return `Just audited my code with MeliusAI and scored a solid ${displayedScore}/100. 🛠️ Time to refactor and hit that 90+ club. Audit yours here:`;
  }

  return `MeliusAI just humbled my codebase with a ${displayedScore}/100... 😅 Back to the drawing board! See if it roasts your code too:`;
}

export function getMotivationalBannerClassName(score: number) {
  const normalizedScore = normalizeAuditScore(score);

  if (normalizedScore >= 90) {
    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-50 shadow-[0_0_30px_rgba(16,185,129,0.08)]';
  }

  if (normalizedScore >= 80) {
    return 'border-sky-400/30 bg-sky-500/10 text-sky-50 shadow-[0_0_30px_rgba(14,165,233,0.07)]';
  }

  if (normalizedScore >= 70) {
    return 'border-blue-400/25 bg-slate-500/10 text-blue-50 shadow-[0_0_30px_rgba(59,130,246,0.06)]';
  }

  if (normalizedScore >= 50) {
    return 'border-amber-400/30 bg-amber-500/10 text-amber-50 shadow-[0_0_30px_rgba(245,158,11,0.07)]';
  }

  return 'border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 text-amber-50 shadow-[0_0_30px_rgba(245,158,11,0.08)]';
}
