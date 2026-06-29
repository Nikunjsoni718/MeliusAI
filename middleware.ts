import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { geolocation } from '@vercel/functions'

export function middleware(request: NextRequest) {
  // 1. Extract the country code using the standard Next.js 15+ framework utility
  const geo = geolocation(request)
  const country = geo.country || 'IN' // Defaults nicely to India for your primary market space!

  // 2. Clone the incoming request headers to pass them DOWNSTREAM to layouts/pages
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-geo-country', country)

  // 3. Return the next chain step passing the modified request headers block
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

// Only run middleware on dashboard page routes
export const config = {
  matcher: ['/profile/:path*', '/opportunities/:path*'],
}