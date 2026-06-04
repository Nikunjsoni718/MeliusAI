'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { AuthPanel } from '@/components/auth/auth-panel';
import type { Database } from '@/types/supabase';

type AuthGateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authEnabled: boolean;
  supabase: SupabaseClient<Database> | null;
};

export function AuthGate({ open, onOpenChange, authEnabled, supabase }: AuthGateProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-md">
      <div className="absolute inset-0" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-lg">
        <AuthPanel
          authEnabled={authEnabled}
          onClose={() => onOpenChange(false)}
          showCloseButton
          supabase={supabase}
        />
      </div>
    </div>
  );
}
