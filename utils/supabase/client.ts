/* File: utils/supabase/client.ts
 * Version: v2
 * Date: 2025-10-13
 * Notes: Use createBrowserClient so auth cookies sync with middleware.
 */
'use client'

import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  }
)
