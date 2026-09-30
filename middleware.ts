import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { geolocation } from '@vercel/functions';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { supabaseAuthCookieOptions } from '@/lib/supabase/cookie-options';

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function middleware(request: NextRequest) {
  const geo = geolocation(request);

  const nextResponse = () => {
    // Recreate this header bag after a refresh. `request.cookies.set()` below
    // updates the request cookie header, which lets the following server
    // component read the renewed session during the same navigation.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-geo-country', geo.country || 'IN');

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  };

  let response = nextResponse();

  if (!hasSupabaseEnv()) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseAuthCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Update the request copy first so server components see the same
          // renewed session that will be returned to the browser.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

          response = nextResponse();
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Do not replace this with getSession(): getUser() validates the current
  // access token and exchanges a valid refresh token before any route-level
  // redirect or server component reads the request cookies.
  await supabase.auth.getUser();

  return response;
}

// Refresh authenticated cookies on the landing route as well as every route
// that can render a dashboard. Public profile URLs remain publicly readable.
export const config = {
  matcher: [
    '/',
    '/profile/:path*',
    '/opportunities/:path*',
    '/home/:path*',
    '/company/:path*',
    '/organization/:path*',
    '/vault/:path*',
    '/settings/:path*',
  ],
};
