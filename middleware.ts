/* File: middleware.ts
 * Version: v2
 * Date: 2025-10-13
 * Notes: Blocks /signup unless NEXT_PUBLIC_ENABLE_SIGNUP === 'true'. Keeps Supabase auth cookies in sync.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isCustomerSignupEnabled } from './app/lib/auth/signup-policy'

export async function middleware(req: NextRequest) {
  const url = req.nextUrl
  const pathname = url.pathname
  const res = NextResponse.next()

  // Production is explicitly waitlist-only. Staging and local behavior remain
  // controlled by the shared server-side environment policy.
  const signupEnabled = isCustomerSignupEnabled()
  if (!signupEnabled && pathname.startsWith('/signup')) {
    url.pathname = '/'
    url.searchParams.set('waitlist', '1')
    return NextResponse.redirect(url)
  }

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
  await supabase.auth.getUser().catch(() => null)

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)'
  ]
}
