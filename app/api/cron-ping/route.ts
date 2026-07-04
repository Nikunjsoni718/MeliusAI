import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('profiles').select('id').limit(1);

  if (error) {
    console.error('Cron ping Supabase warm-up failed:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, message: 'Server and DB pool warmed' },
    { status: 200 }
  );
}
