import html2canvas from 'html2canvas';

export const AUDIT_CAPTURE_TARGET_ID = 'scorecard-capture';

function getSafeReportName(assetName: string) {
  const normalizedName = assetName
    .replace(/\.[^/.]+$/, '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedName || 'audit';
}

export async function downloadFullAuditReport(element: HTMLElement, assetName: string) {
  if ('fonts' in document) {
    await document.fonts.ready;
  }

  const captureWidth = element.scrollWidth;
  const captureHeight = element.scrollHeight;
  const canvas = await html2canvas(element, {
    backgroundColor: '#000000',
    height: captureHeight,
    logging: false,
    scale: 2,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
    useCORS: true,
    width: captureWidth,
    windowHeight: captureHeight,
    windowWidth: Math.max(document.documentElement.clientWidth, captureWidth),
    onclone: (clonedDocument) => {
      const clonedCaptureTarget = clonedDocument.getElementById(AUDIT_CAPTURE_TARGET_ID);

      if (!clonedCaptureTarget) {
        return;
      }

      Object.assign(clonedCaptureTarget.style, {
        height: 'auto',
        maxHeight: 'none',
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'visible',
        width: `${captureWidth}px`,
      });
      clonedCaptureTarget.scrollLeft = 0;
      clonedCaptureTarget.scrollTop = 0;
    },
  });

  const reportBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('The audit report image could not be created.'));
    }, 'image/png');
  });
  const objectUrl = URL.createObjectURL(reportBlob);
  const downloadLink = document.createElement('a');

  downloadLink.href = objectUrl;
  downloadLink.download = `MeliusAI-${getSafeReportName(assetName)}-full-audit.png`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
