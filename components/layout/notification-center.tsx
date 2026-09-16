'use client';

import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useNotifications, type WorkspaceNotification } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

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

function repositoryLabel(notification: WorkspaceNotification) {
  const repoName = notification.metadata?.repo_name;
  return typeof repoName === 'string' && repoName.trim() ? repoName : notification.project_id;
}

function safeActionUrl(value: string) {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/vault';
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
    <div ref={containerRef} className="relative px-3 pb-3">
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
          className="absolute bottom-full left-3 z-[70] mb-2 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-700/80 bg-[#0A0F1C] shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Notifications</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Project activity and audit updates</p>
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
          <div className="max-h-[28rem] overflow-y-auto p-2">
            {groupedNotifications.length ? groupedNotifications.map(([label, group]) => (
              <div key={label} className="mb-3 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                {group.map((notification) => {
                  const project = repositoryLabel(notification);
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
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-slate-100">{notification.title}</p>
                        <time className="shrink-0 text-[10px] text-slate-500">{relativeTime(notification.created_at)}</time>
                      </div>
                      {project ? <span className="mt-1 inline-flex rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{project}</span> : null}
                      <p className="mt-1.5 text-xs leading-5 text-slate-400">{notification.message}</p>
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
