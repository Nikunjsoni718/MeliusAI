import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SubscriptionPayload = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: { auth?: unknown; p256dh?: unknown } | null;
};

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function isBase64Url(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function parseSubscription(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as SubscriptionPayload;
  const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : '';
  const p256dh = typeof payload.keys?.p256dh === 'string' ? payload.keys.p256dh.trim() : '';
  const auth = typeof payload.keys?.auth === 'string' ? payload.keys.auth.trim() : '';
  const expirationTime = typeof payload.expirationTime === 'number' && Number.isFinite(payload.expirationTime)
    ? Math.round(payload.expirationTime)
    : null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !p256dh || !auth || !isBase64Url(p256dh) || !isBase64Url(auth)) return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth, expirationTime };
}

async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

export async function POST(request: NextRequest) {
  try {
    const subscription = parseSubscription(await request.json().catch(() => null));
    if (!subscription) return response({ error: 'Invalid Web Push subscription.' }, 400);

    const { supabase, user } = await getCurrentUser();
    if (!user) return response({ error: 'Unauthorized' }, 401);
    const { data, error } = await supabase
      .from('web_push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          expiration_time: subscription.expirationTime,
          user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select('id, endpoint')
      .single();
    if (error) throw error;

    return response({ subscription: data }, 201);
  } catch (error) {
    console.error('Unable to save Web Push subscription:', error);
    return response({ error: 'Unable to save Web Push subscription.' }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    const endpoint = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.endpoint === 'string'
      ? payload.endpoint.trim()
      : '';
    if (!endpoint) return response({ error: 'A subscription endpoint is required.' }, 400);

    const { supabase, user } = await getCurrentUser();
    if (!user) return response({ error: 'Unauthorized' }, 401);
    const { error } = await supabase
      .from('web_push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
    if (error) throw error;
    return response({ removed: true });
  } catch (error) {
    console.error('Unable to remove Web Push subscription:', error);
    return response({ error: 'Unable to remove Web Push subscription.' }, 500);
  }
}
