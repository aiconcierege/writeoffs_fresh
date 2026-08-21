/* File: middleware.ts
 * Version: v2
 * Date: 2025-10-13
 * Notes: Blocks /signup unless NEXT_PUBLIC_ENABLE_SIGNUP === 'true'. Keeps Supabase auth cookies in sync.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAuthenticatedRoute } from './app/lib/route-policy'

function redirectWithRefreshedAuthCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url)
  for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie)
  return redirectResponse
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl
  const pathname = url.pathname
  const res = NextResponse.next()

  // --- Keep Supabase auth cookies in sync for server components ---
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          res.cookies.set({ name, value, ...options })
        },
        remove: (name: string, options: any) => {
          res.cookies.set({ name, value: '', ...options, maxAge: 0 })
        }
      }
    }
  )
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))

  if (user && (pathname === '/login' || pathname === '/signup')) {
    url.pathname = '/home'
    url.search = ''
    return redirectWithRefreshedAuthCookies(url, res)
  }

  const signupEnabled = process.env.NEXT_PUBLIC_ENABLE_SIGNUP === 'true'
  if (!signupEnabled && pathname.startsWith('/signup')) {
    url.pathname = '/'
    url.searchParams.set('waitlist', '1')
    return redirectWithRefreshedAuthCookies(url, res)
  }

  if (!user && isAuthenticatedRoute(pathname)) {
    url.pathname = '/login'
    url.search = ''
    return redirectWithRefreshedAuthCookies(url, res)
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)'
  ]
}
