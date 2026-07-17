function normalizeAuditScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

export function getMotivationalMessage(score: number) {
  const normalizedScore = normalizeAuditScore(score);

  if (normalizedScore >= 90) {
    return 'Outstanding work! 🌟 Your architecture is exceptionally clean and production-ready. You should definitely share this score. 🚀';
  }

  if (normalizedScore >= 80) {
    return "Great code! 👏 You are just a few minor tweaks away from that 90+ bracket. Check the insights below and let's run it again. 🔄";
  }

  if (normalizedScore >= 70) {
    return 'Solid effort! 👍 The foundation is definitely there. Implement a few of the suggested refactors below and you will see a massive jump in your score. 📈';
  }

  if (normalizedScore >= 50) {
    return 'Good start, but there is room to grow. 🌱 Focus on the core logic and security fixes highlighted below to drastically improve your next audit. 🛠️';
  }

  return "Every great project starts with a rough draft! 📝 Don't let the score discourage you. Tackle the critical fixes first, and let's see how much you improve on the next run. 💪";
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
