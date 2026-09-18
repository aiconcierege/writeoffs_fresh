import { timedSupabaseFetch,requestMemo } from '../../app/lib/performance/request-timing'
/* File: utils/supabase/server.ts
 * Version: v2
 * Date: 2025-10-14
 * Notes: Next 15 requires awaiting cookies() in routes. This helper is now async.
 */
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function createServerSupabase() {
 return requestMemo('customer_supabase',createRequestSupabase)
}
async function createRequestSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      global: { fetch: timedSupabaseFetch },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options)
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', { ...options, maxAge: 0 })
        }
      }
    }
  )
}
