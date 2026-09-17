'use client';

import useSWR from 'swr';

import { workspaceCacheKeys } from '@/lib/workspace-cache';

export type WorkspaceNotification = {
  id: string;
  user_id: string;
  project_id: string | null;
  type: 'session_cooldown_re_audit' | 'audit_completed' | 'stale_project_nudge' | 'system_security' | 'project_created' | 'project_deleted';
  title: string;
  message: string;
  action_url: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

type NotificationsResponse = {
  notifications: WorkspaceNotification[];
  unreadCount: number;
};

async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await fetch('/api/notifications', { cache: 'no-store' });
  const payload = (await response.json().catch(() => null)) as NotificationsResponse & { error?: string } | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? 'Unable to load notifications.');
  return { notifications: payload.notifications ?? [], unreadCount: payload.unreadCount ?? 0 };
}

export function useNotifications(userId: string | null | undefined) {
  const key = userId ? workspaceCacheKeys.notifications(userId) : null;
  const swr = useSWR<NotificationsResponse, Error>(key, fetchNotifications, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  });

  async function markRead({ ids, markAll = false }: { ids?: string[]; markAll?: boolean }) {
    const response = await fetch('/api/notifications/mark-read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, markAll }),
    });
    const payload = (await response.json().catch(() => null)) as { updatedIds?: string[]; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error ?? 'Unable to update notifications.');
    const updated = new Set(payload?.updatedIds ?? []);
    await swr.mutate((current) => {
      if (!current) return current;
      const notifications = current.notifications.map((notification) =>
        markAll || updated.has(notification.id) ? { ...notification, is_read: true } : notification
      );
      return { notifications, unreadCount: notifications.filter((notification) => !notification.is_read).length };
    }, { revalidate: false });
  }

  return { ...swr, notifications: swr.data?.notifications ?? [], unreadCount: swr.data?.unreadCount ?? 0, markRead };
}
