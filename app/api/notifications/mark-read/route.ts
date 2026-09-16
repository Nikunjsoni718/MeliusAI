import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MarkReadPayload = { ids?: unknown; markAll?: unknown };

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function parsePayload(value: unknown): { ids: string[]; markAll: boolean } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as MarkReadPayload;
  const markAll = payload.markAll === true;
  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    : [];
  return markAll || ids.length ? { ids: [...new Set(ids)], markAll } : null;
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = parsePayload(await request.json().catch(() => null));
    if (!parsed) return response({ error: 'Provide notification ids or markAll.' }, 400);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return response({ error: 'Unauthorized' }, 401);

    let query = supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    if (!parsed.markAll) query = query.in('id', parsed.ids);
    const { data, error } = await query.select('id');
    if (error) throw error;

    return response({ updatedIds: (data ?? []).map((notification) => notification.id) });
  } catch (error) {
    console.error('Unable to mark notifications as read:', error);
    return response({ error: 'Unable to mark notifications as read.' }, 500);
  }
}
