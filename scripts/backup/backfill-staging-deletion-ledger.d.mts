import type {SupabaseClient} from '@supabase/supabase-js'
import type {DeletionEntry} from './independent-deletion-ledger.mjs'
export function reconcileCompletedTombstones(options:{database:SupabaseClient;publish:(entry:DeletionEntry)=>Promise<{versionId:string}>}):Promise<Record<string,unknown>>
