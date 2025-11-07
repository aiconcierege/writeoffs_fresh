// app/lib/supabaseServer.d.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Type declaration for the server-side Supabase client helper.
 * Ensures correct types without exposing implementation details.
 */
export function createClient(): SupabaseClient;
