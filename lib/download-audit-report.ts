import { toPng } from 'html-to-image';

export const AUDIT_CAPTURE_TARGET_ID = 'scorecard-capture';

function getSafeReportName(assetName: string) {
  const normalizedName = assetName
    .replace(/\.[^/.]+$/, '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedName || 'audit';
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function freezeScoreArcs(captureTarget: HTMLElement) {
  const scoreArcs = Array.from(
    captureTarget.querySelectorAll<HTMLElement | SVGElement>('[data-audit-score-arc]')
  );

  return scoreArcs.map((scoreArc) => {
    const originalStyle = scoreArc.getAttribute('style');
    const originalPathLength = scoreArc.getAttribute('pathLength');
    const originalDashArray = scoreArc.getAttribute('stroke-dasharray');
    const originalDashOffset = scoreArc.getAttribute('stroke-dashoffset');
    const computedStyle = window.getComputedStyle(scoreArc);

    scoreArc.style.setProperty('animation', 'none', 'important');
    scoreArc.style.setProperty('transition', 'none', 'important');
    scoreArc.style.setProperty('opacity', '1', 'important');
    scoreArc.style.setProperty('visibility', 'visible', 'important');

    if (scoreArc instanceof SVGElement) {
      const rawScore = Number(scoreArc.dataset.score ?? 0);
      const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;

      scoreArc.setAttribute('pathLength', '100');
      scoreArc.setAttribute('stroke-dasharray', `${score} ${100 - score}`);
      scoreArc.setAttribute('stroke-dashoffset', '0');
      scoreArc.style.setProperty('stroke', computedStyle.stroke || '#00d2ff', 'important');
    } else {
      // Convert the resolved conic gradient into an inline, static value so the
      // foreignObject clone does not depend on a transition or pending style pass.
      scoreArc.style.setProperty('background-image', computedStyle.backgroundImage, 'important');
    }

    return () => {
      if (originalStyle === null) {
        scoreArc.removeAttribute('style');
      } else {
        scoreArc.setAttribute('style', originalStyle);
      }

      const restoreAttribute = (name: string, value: string | null) => {
        if (value === null) {
          scoreArc.removeAttribute(name);
        } else {
          scoreArc.setAttribute(name, value);
        }
      };

      restoreAttribute('pathLength', originalPathLength);
      restoreAttribute('stroke-dasharray', originalDashArray);
      restoreAttribute('stroke-dashoffset', originalDashOffset);
    };
  });
}

export async function downloadFullAuditReport(element: HTMLElement, assetName: string) {
  if ('fonts' in document) {
    await document.fonts.ready;
  }

  const restoreScoreArcs = freezeScoreArcs(element);

  try {
    // Let React's final score styles and the static arc overrides reach the
    // compositor before html-to-image clones the report DOM.
    await waitForPaint();

    const captureWidth = Math.ceil(element.scrollWidth);
    const captureHeight = Math.ceil(element.scrollHeight);
    const dataUrl = await toPng(element, {
      backgroundColor: '#000000',
      cacheBust: true,
      canvasHeight: captureHeight,
      canvasWidth: captureWidth,
      height: captureHeight,
      pixelRatio: 2,
      width: captureWidth,
      filter: (node) => node.dataset?.imageExportIgnore !== 'true',
      style: {
        boxSizing: 'border-box',
        height: `${captureHeight}px`,
        maxHeight: 'none',
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'visible',
        width: `${captureWidth}px`,
      },
    });
    const downloadLink = document.createElement('a');

    downloadLink.href = dataUrl;
    downloadLink.download = `MeliusAI-${getSafeReportName(assetName)}-full-audit.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    return dataUrl;
  } finally {
    restoreScoreArcs.forEach((restoreScoreArc) => restoreScoreArc());
  }
}
