'use client';

import { useEffect, useMemo } from 'react';

const officeViewerExtensions = new Set(['ppt', 'pptx', 'xls', 'xlsx', 'doc', 'docx']);

function getFileExtensionFromUrlOrName(previewUrl: string | null, fileName: string | null) {
  const fromName = fileName?.split('.').pop()?.trim().toLowerCase();

  if (fromName) {
    return fromName;
  }

  if (!previewUrl) {
    return '';
  }

  try {
    const url = new URL(previewUrl);
    return url.pathname.split('.').pop()?.trim().toLowerCase() ?? '';
  } catch {
    return previewUrl.split('?')[0]?.split('#')[0]?.split('.').pop()?.trim().toLowerCase() ?? '';
  }
}

function getViewerSrc(previewUrl: string | null, fileName: string | null) {
  if (!previewUrl) {
    return null;
  }

  const extension = getFileExtensionFromUrlOrName(previewUrl, fileName);

  if (officeViewerExtensions.has(extension)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(previewUrl)}`;
  }

  return previewUrl;
}

function getFallbackFileName(previewUrl: string | null) {
  if (!previewUrl) {
    return 'Asset Preview';
  }

  try {
    const url = new URL(previewUrl);
    return decodeURIComponent(url.pathname.split('/').pop() ?? 'Asset Preview') || 'Asset Preview';
  } catch {
    return decodeURIComponent(previewUrl.split('/').pop() ?? 'Asset Preview') || 'Asset Preview';
  }
}

type AssetPreviewModalProps = {
  activePreviewName: string | null;
  activePreviewUrl: string | null;
  onClose: () => void;
};

export function AssetPreviewModal({
  activePreviewName,
  activePreviewUrl,
  onClose,
}: AssetPreviewModalProps) {
  const viewerSrc = useMemo(
    () => getViewerSrc(activePreviewUrl, activePreviewName),
    [activePreviewName, activePreviewUrl]
  );
  const previewName = activePreviewName ?? getFallbackFileName(activePreviewUrl);

  useEffect(() => {
    if (!activePreviewUrl) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePreviewUrl, onClose]);

  if (!activePreviewUrl || !viewerSrc) {
    return null;
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-[90vw] md:w-[70vw] lg:w-[65vw] h-[85vh] max-w-5xl max-h-[55rem] bg-[#060b1e]/95 border border-blue-950/80 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden transition-all duration-300 transform scale-100">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-blue-950/60 px-6 py-4">
          <p className="truncate font-mono text-xs uppercase tracking-wider text-zinc-400">{previewName}</p>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-zinc-500 hover:text-rose-400 uppercase tracking-wider transition-colors duration-200 cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-slate-300">
          <div className="h-full min-h-64 overflow-hidden">
            <iframe
              title={previewName}
              src={viewerSrc}
              className="w-full h-full rounded-xl border border-blue-950/60 bg-[#090d1f]/40 shadow-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
