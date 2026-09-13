import { NextRequest, NextResponse } from 'next/server';

import { deleteGitHubConnection } from '@/lib/github-connection';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { eraseUserVaultData } from '@/lib/vault-cleanup';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
    if (payload?.confirmation !== 'DELETE ACCOUNT') {
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
    await deleteGitHubConnection(user.id);

    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ deleted }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Unable to delete account:', error);
    return NextResponse.json({ error: 'Unable to delete account.' }, { status: 500 });
  }
}
