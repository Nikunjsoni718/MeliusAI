import type { User } from '@supabase/supabase-js';

import type { ViewerProfile } from '@/lib/viewer-types';

/**
 * This is deliberately token-free because it is serialized into the client
 * component tree. Session access tokens remain server-only.
 */
export type ViewerBootstrap = {
  user: User | null;
  profile: ViewerProfile | null;
};

export type WorkspaceBootstrap = {
  viewer: ViewerBootstrap;
  /** Server-only. Never pass this object itself to a Client Component. */
  accessToken: string | null;
};
