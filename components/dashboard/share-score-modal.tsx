'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

import { getShareText } from '@/lib/audit-motivation';

type ShareScoreModalProps = {
  assetId: string;
  score: number;
  onClose: () => void;
};

const PREVIEW_BASE_URL = 'https://meliusai.in/preview';

function copyTextWithFallback(value: string) {
  const temporaryTextArea = document.createElement('textarea');
  temporaryTextArea.value = value;
  temporaryTextArea.setAttribute('readonly', '');
  temporaryTextArea.style.position = 'fixed';
  temporaryTextArea.style.opacity = '0';
  document.body.appendChild(temporaryTextArea);
  temporaryTextArea.select();
  const didCopy = document.execCommand('copy');
  temporaryTextArea.remove();

  if (!didCopy) {
    throw new Error('The browser rejected the clipboard request.');
  }
}

export function ShareScoreModal({ assetId, score, onClose }: ShareScoreModalProps) {
  const normalizedScore = Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : 0;
  const [message, setMessage] = useState(() => getShareText(normalizedScore));
  const [isSharing, setIsSharing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const previewLink = `${PREVIEW_BASE_URL}/${encodeURIComponent(assetId)}`;
  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(previewLink)}`;
  const xShareParameters = new URLSearchParams({
    text: message,
    url: previewLink,
  });
  const xShareUrl = `https://twitter.com/intent/tweet?${xShareParameters.toString()}`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleNativeShare() {
    setFeedback(null);

    if (typeof navigator.share !== 'function') {
      setFeedback('Native sharing is not supported in this browser. Choose an option below.');
      return;
    }

    setIsSharing(true);

    try {
      await navigator.share({
        title: 'MeliusAI Audit',
        text: message,
        url: previewLink,
      });
      setFeedback('Shared successfully.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFeedback('Sharing could not be completed. Try one of the options below.');
      }
    } finally {
      setIsSharing(false);
    }
  }

  async function handleCopyLink() {
    setFeedback(null);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(previewLink);
      } else {
        copyTextWithFallback(previewLink);
      }

      setIsCopied(true);
    } catch {
      setFeedback('The link could not be copied automatically. Select it above and copy it manually.');
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-results-title"
        className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-slate-950 p-5 text-slate-100 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400">
              MeliusAI Audit
            </p>
            <h2 id="share-results-title" className="mt-1 text-xl font-bold tracking-tight text-white">
              Share Your Results
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-rose-400/50 hover:text-rose-200"
            aria-label="Close share modal"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="share-score-message" className="text-xs font-semibold text-slate-300">
              Post description
            </label>
            <textarea
              id="share-score-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
            />
          </div>

          <div>
            <label htmlFor="share-preview-link" className="text-xs font-semibold text-slate-300">
              Asset preview link
            </label>
            <input
              id="share-preview-link"
              type="text"
              value={previewLink}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 font-mono text-xs text-slate-400 outline-none focus:border-cyan-400/50"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleNativeShare()}
            disabled={isSharing}
            className="w-full rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            {isSharing ? 'Opening Share Sheet...' : 'Share'}
          </button>

          <div className="border-t border-slate-800 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              More ways to share
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:text-emerald-200"
              >
                {isCopied ? 'Copied!' : 'Copy Link'}
              </button>
              <a
                href={linkedInShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-center text-xs font-semibold text-slate-200 transition hover:border-blue-400/50 hover:text-blue-200"
              >
                Share to LinkedIn
              </a>
              <a
                href={xShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-center text-xs font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white"
              >
                Share to X
              </a>
            </div>
          </div>

          {feedback ? (
            <p className="m-0 text-center text-xs text-amber-200" role="status" aria-live="polite">
              {feedback}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
