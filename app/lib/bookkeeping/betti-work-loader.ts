import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { getCanonicalQuestionCandidates } from './customer-questions'
import { projectBettiWork, type WorkContext } from './betti-work'

/** Authenticated client only. The RPC checks owner + AAL2; no service-role bypass.
 * Bracket the question read with context reads so concurrent worker completion
 * produces a retry, not questions joined to a different decision snapshot. */
export async function loadBettiWork(input: {
  db: SupabaseClient; businessId: string; scope: 'business' | 'expenses'; asOf?: string
  continuityRecordId?: string; processingEnabled?: boolean
}) {
  const asOf = input.asOf ?? new Date().toISOString()
  const read = async () => {
    const result = await input.db.rpc('read_betti_work_context', { p_business_id: input.businessId })
    if (result.error || !result.data) throw new Error('Betti work context unavailable')
    return result.data as WorkContext
  }
  const digest = (context: WorkContext) => createHash('sha256').update(JSON.stringify(context)).digest('hex')
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await read()
    // Existing canonical question readers use PostgREST's default 1,000-row
    // ceiling. Never present their potentially truncated output as exact work.
    // A future batched adapter can raise this guard without changing semantics.
    if (before.records.length >= 1000 || before.links.length >= 1000 || (before.questionVersions?.length ?? 0) >= 1000)
      throw new Error('Projection question adapter capacity exceeded')
    const queue = await getCanonicalQuestionCandidates({ supabase: input.db, scope: input.scope, asOf })
    const after = await read()
    if (digest(before) !== digest(after)) continue
    return projectBettiWork({ businessId: input.businessId, context: after, questions: queue.questions,
      asOf, continuityRecordId: input.continuityRecordId, processingEnabled: input.processingEnabled })
  }
  throw new Error('Betti work changed during projection; retry the read')
}
