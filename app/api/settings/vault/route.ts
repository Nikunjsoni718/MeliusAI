import { NextRequest, NextResponse } from 'next/server';

import { eraseUserVaultData } from '@/lib/vault-cleanup';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
    if (payload?.confirmation !== 'ERASE VAULT') {
      return NextResponse.json({ error: 'Confirmation phrase does not match.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deleted = await eraseUserVaultData(user.id);
    return NextResponse.json({ deleted }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Unable to erase Vault data:', error);
    return NextResponse.json({ error: 'Unable to erase Vault data.' }, { status: 500 });
  }
}
