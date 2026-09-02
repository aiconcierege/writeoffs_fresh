import 'server-only'

import { createClient } from '@supabase/supabase-js'

export function createServerAdminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Trusted Supabase server configuration is unavailable.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
