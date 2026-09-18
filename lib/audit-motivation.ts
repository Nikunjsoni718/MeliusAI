function normalizeAuditScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(98, score));
}

export function getMotivationalMessage(score: number) {
  const normalizedScore = normalizeAuditScore(score);

  if (normalizedScore >= 96) {
    return 'Baseline engineering standards are met. Continue reviewing architectural and operational trade-offs as the system evolves.';
  }

  if (normalizedScore >= 80) {
    return 'The assessment identified material warnings. Prioritize their verified impact before expanding scope.';
  }

  if (normalizedScore >= 70) {
    return 'The foundation is usable, but multiple risks require deliberate remediation and follow-up verification.';
  }

  if (normalizedScore >= 50) {
    return 'Address the critical finding before treating this implementation as production-ready.';
  }

  return 'Multiple critical findings require fundamental remediation before production deployment.';
}

export function getShareText(score: number) {
  const normalizedScore = normalizeAuditScore(score);
  const displayedScore = Math.round(normalizedScore);

  if (normalizedScore >= 96) {
    return `MeliusAI completed an evidence-based engineering audit of this codebase: ${displayedScore}/100. Review the verified findings and directives:`;
  }

  if (normalizedScore >= 70) {
    return `MeliusAI completed an engineering audit of this codebase: ${displayedScore}/100. The report identifies prioritized technical risks:`;
  }

  return `MeliusAI completed an engineering audit of this codebase: ${displayedScore}/100. Critical remediation is documented in the report:`;
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
