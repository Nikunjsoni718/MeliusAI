'use client';

import { Bell, CheckCheck, FolderPlus, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useNotifications, type WorkspaceNotification } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

const UUID_EXACT_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;

type NotificationCopy = {
  before: string;
  highlightedValue?: string;
  after?: string;
};

function relativeTime(value: string) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return 'Recently';
  const seconds = Math.max(0, Math.round((Date.now() - milliseconds) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function dateLabel(value: string) {
  const notificationDate = new Date(value);
  if (Number.isNaN(notificationDate.getTime())) return 'Earlier';
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = new Date(notificationDate.getFullYear(), notificationDate.getMonth(), notificationDate.getDate()).getTime();
  if (targetStart === todayStart) return 'Today';
  if (targetStart === todayStart - 86_400_000) return 'Yesterday';
  return notificationDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function cleanRepositoryName(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  if (!normalized || UUID_EXACT_PATTERN.test(normalized)) return null;
  return normalized.split('/').filter(Boolean).at(-1) ?? null;
}

function repositoryLabel(notification: WorkspaceNotification) {
  return cleanRepositoryName(notification.metadata?.repo_name) ?? cleanRepositoryName(notification.project_id);
}

function notificationTitle(notification: WorkspaceNotification, lifecycleTitle?: string) {
  const titleByType: Partial<Record<WorkspaceNotification['type'], string>> = {
    session_cooldown_re_audit: 'New Code Shipped',
    audit_completed: 'Audit Complete',
    stale_project_nudge: 'Project Update Due',
    system_security: 'Security Update',
  };
  if (lifecycleTitle) return lifecycleTitle;
  if (titleByType[notification.type]) return titleByType[notification.type];

  return notification.title
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const normalized = word.toLowerCase();
      if (normalized === 'github') return 'GitHub';
      if (normalized === 'meliusai') return 'MeliusAI';
      if (normalized === 'api') return 'API';
      if (normalized === 'ai') return 'AI';
      return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    })
    .join(' ') || 'Workspace Update';
}

function changedLines(notification: WorkspaceNotification) {
  const value = notification.metadata?.lines_changed;
  const lines = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(lines) && lines > 0 ? lines : null;
}

function cleanNotificationMessage(message: string) {
  return message
    .replace(UUID_PATTERN, 'this project')
    .replace(/\b[A-Za-z0-9._-]+\/([A-Za-z0-9._-]+)\b/g, '$1');
}

function notificationCopy(
  notification: WorkspaceNotification,
  project: string | null,
  lifecycle: ReturnType<typeof lifecyclePresentation>
): NotificationCopy {
  const lines = changedLines(notification);
  if (notification.type === 'session_cooldown_re_audit' && project && lines) {
    return {
      before: `Shipped ${lines} new ${lines === 1 ? 'line' : 'lines'} of code to `,
      highlightedValue: project,
      after: '. Run a fresh audit to update your scorecard.',
    };
  }
  if (notification.type === 'audit_completed' && project) {
    return {
      before: 'A fresh audit for ',
      highlightedValue: project,
      after: ' is ready to review in your scorecard.',
    };
  }
  if (notification.type === 'stale_project_nudge' && project) {
    return {
      before: 'No recent commits were detected in ',
      highlightedValue: project,
      after: '. Run a fresh audit when you are ready to update your scorecard.',
    };
  }
  if (lifecycle && project) {
    return notification.type === 'project_created'
      ? { before: 'Added ', highlightedValue: project, after: ' to your workspace.' }
      : { before: 'Removed ', highlightedValue: project, after: ' from your workspace.' };
  }
  if (lifecycle) {
    return notification.type === 'project_created'
      ? { before: 'A new project was added to your workspace.' }
      : { before: 'A project was removed from your workspace.' };
  }
  return { before: cleanNotificationMessage(notification.message) };
}

function safeActionUrl(value: string) {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/vault';
}

function lifecyclePresentation(notification: WorkspaceNotification) {
  if (notification.type === 'project_created') {
    return {
      icon: FolderPlus as LucideIcon,
      iconClassName: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
      title: 'Project Created',
    };
  }
  if (notification.type === 'project_deleted') {
    return {
      icon: Trash2 as LucideIcon,
      iconClassName: 'border-rose-300/25 bg-rose-400/10 text-rose-200',
      title: 'Project Deleted',
    };
  }
  return null;
}

export function NotificationCenter({ userId }: { userId: string }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { notifications, unreadCount, markRead } = useNotifications(userId);
  const groupedNotifications = useMemo(() => {
    const groups = new Map<string, WorkspaceNotification[]>();
    notifications.forEach((notification) => {
      const label = dateLabel(notification.created_at);
      groups.set(label, [...(groups.get(label) ?? []), notification]);
    });
    return [...groups.entries()];
  }, [notifications]);

  useEffect(() => {
    if (!isOpen) return;
    const closeIfOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  async function openNotification(notification: WorkspaceNotification) {
    setActionError(null);
    try {
      if (!notification.is_read) await markRead({ ids: [notification.id] });
      setIsOpen(false);
      router.push(safeActionUrl(notification.action_url));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update this notification.');
    }
  }

  async function markAllRead() {
    setActionError(null);
    try {
      await markRead({ markAll: true });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to mark notifications as read.');
    }
  }

  return (
    <div ref={containerRef} className="relative z-50 px-3 pb-3">
      <button
        type="button"
        aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
        className="relative flex h-10 w-full items-center justify-center rounded-lg border border-blue-950/60 bg-[#071329]/60 text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-cyan-400 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-slate-950">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute bottom-0 left-full z-[70] ml-4 flex max-h-96 w-80 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A]/95 shadow-2xl shadow-cyan-900/10 backdrop-blur-md max-md:bottom-full max-md:left-3 max-md:mb-3 max-md:ml-0 max-md:w-[calc(100vw-2rem)]"
        >
          <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
          <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200 shadow-[0_0_18px_rgba(6,182,212,0.15)]">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-white">Notifications</h2>
                <p className="mt-0.5 text-[11px] text-slate-400">Project activity and audit updates</p>
              </div>
            </div>
            <button
              type="button"
              disabled={!unreadCount}
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-cyan-300 transition hover:bg-cyan-950/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Mark all read
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {groupedNotifications.length ? groupedNotifications.map(([label, group]) => (
              <div key={label} className="mb-3 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                {group.map((notification) => {
                  const project = repositoryLabel(notification);
                  const lifecycle = lifecyclePresentation(notification);
                  const copy = notificationCopy(notification, project, lifecycle);
                  const LifecycleIcon = lifecycle?.icon;
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void openNotification(notification)}
                      className={cn(
                        'mb-1 block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-800/80 focus:bg-slate-800/80 focus:outline-none',
                        !notification.is_read && 'bg-cyan-950/20'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {LifecycleIcon ? (
                          <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-[0_0_16px_rgba(6,182,212,0.12)]', lifecycle?.iconClassName)}>
                            <LifecycleIcon className="h-4 w-4" aria-hidden="true" />
                          </span>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-slate-100">{notificationTitle(notification, lifecycle?.title)}</p>
                            <time className="shrink-0 text-[10px] text-slate-500">{relativeTime(notification.created_at)}</time>
                          </div>
                          <p className="mt-1.5 text-xs leading-5 text-slate-400">
                            {copy.before}
                            {copy.highlightedValue ? <span className="font-medium text-white">{copy.highlightedValue}</span> : null}
                            {copy.after}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )) : <p className="px-3 py-8 text-center text-sm text-slate-500">You are all caught up.</p>}
          </div>
          {actionError ? <p className="border-t border-rose-900/50 px-4 py-2 text-xs text-rose-300">{actionError}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
