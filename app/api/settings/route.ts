import { NextRequest, NextResponse } from 'next/server';

import {
  isCurrentStatus,
  SETTINGS_PROFILE_SELECT,
  type PersistedSettings,
} from '@/lib/settings';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeUsername } from '@/lib/username';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SETTINGS_KEYS = [
  'username',
  'current_status',
  'public_profile_enabled',
  'public_scorecard_enabled',
  'public_contact_email_enabled',
  'default_asset_is_public',
  'audit_alerts_enabled',
  'opportunity_match_alerts_enabled',
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];
type SettingsUpdate = Partial<PersistedSettings>;

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function getAuthenticatedContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

function parseUpdate(payload: unknown): { update?: SettingsUpdate; error?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Settings payload must be an object.' };
  }

  const raw = payload as Record<string, unknown>;
  const unknownKey = Object.keys(raw).find((key) => !SETTINGS_KEYS.includes(key as SettingsKey));
  if (unknownKey) {
    return { error: `Unsupported settings field: ${unknownKey}.` };
  }

  const update: SettingsUpdate = {};
  if ('username' in raw) {
    if (typeof raw.username !== 'string' || !raw.username.trim()) {
      return { error: 'Username is required.' };
    }
    update.username = normalizeUsername(raw.username);
  }
  if ('current_status' in raw) {
    if (raw.current_status !== null && !isCurrentStatus(raw.current_status)) {
      return { error: 'Invalid current status.' };
    }
    update.current_status = raw.current_status;
  }

  for (const key of [
    'public_profile_enabled',
    'public_scorecard_enabled',
    'public_contact_email_enabled',
    'default_asset_is_public',
    'audit_alerts_enabled',
    'opportunity_match_alerts_enabled',
  ] as const) {
    if (key in raw) {
      if (typeof raw[key] !== 'boolean') {
        return { error: `${key} must be a boolean.` };
      }
      update[key] = raw[key];
    }
  }

  return Object.keys(update).length ? { update } : { error: 'No settings were provided.' };
}

function asSettings(value: unknown): PersistedSettings {
  return value as PersistedSettings;
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedContext();
    if (!user) {
      return response({ error: 'Unauthorized' }, 401);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(SETTINGS_PROFILE_SELECT)
      .eq('id', user.id)
      .single();
    if (error || !data) {
      return response({ error: 'Settings profile was not found.' }, 404);
    }

    return response({ settings: asSettings(data) });
  } catch (error) {
    console.error('Unable to load settings:', error);
    return response({ error: 'Unable to load settings.' }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = parseUpdate(await request.json().catch(() => null));
    if (parsed.error || !parsed.update) {
      return response({ error: parsed.error ?? 'Invalid settings payload.' }, 400);
    }

    const { supabase, user } = await getAuthenticatedContext();
    if (!user) {
      return response({ error: 'Unauthorized' }, 401);
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(parsed.update)
      .eq('id', user.id)
      .select(SETTINGS_PROFILE_SELECT)
      .single();
    if (error) {
      if (error.code === '23505') {
        return response({ error: 'That profile URL is already in use.' }, 409);
      }
      throw error;
    }

    return response({ settings: asSettings(data) });
  } catch (error) {
    console.error('Unable to save settings:', error);
    return response({ error: 'Unable to save settings.' }, 500);
  }
}
