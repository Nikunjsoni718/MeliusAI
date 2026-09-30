export const SUPABASE_AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export const supabaseAuthCookieOptions = {
  // @supabase/ssr renews this persistent cookie whenever a refresh token is
  // exchanged. Browser-session cookies would otherwise disappear on restart.
  maxAge: SUPABASE_AUTH_COOKIE_MAX_AGE_SECONDS,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};
