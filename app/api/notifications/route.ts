import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SELECT_COLUMNS =
  'id, user_id, project_id, type, title, message, action_url, is_read, metadata, created_at';

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function getLimit(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get('limit') ?? 40);
  if (!Number.isInteger(raw)) return 40;
  return Math.min(Math.max(raw, 1), 100);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return response({ error: 'Unauthorized' }, 401);

    const [notificationsResult, unreadResult] = await Promise.all([
      supabase
        .from('notifications')
        .select(SELECT_COLUMNS)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(getLimit(request)),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
    ]);
    if (notificationsResult.error || unreadResult.error) {
      throw notificationsResult.error ?? unreadResult.error;
    }

    return response({
      notifications: notificationsResult.data ?? [],
      unreadCount: unreadResult.count ?? 0,
    });
  } catch (error) {
    console.error('Unable to load notifications:', error);
    return response({ error: 'Unable to load notifications.' }, 500);
  }
}
