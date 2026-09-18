import {requestUser} from '../performance/request-identity'
import 'server-only'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import { classifyOperatingExpense } from './operating-expense-classification'
import { loadBookkeepingEvaluationSnapshot } from './evaluation-snapshot'
import { processOperatingExpenseTreatment } from './operating-expense-processing'
import { CanonicalBookkeepingService } from './service'
import { SupabaseBookkeepingRepository } from './supabase-repository'

/** Completes bookkeeping within the customer's answer command, preserving every supplied fact. */
export function answeredExpenseAllocations(snapshot: BookkeepingEvaluationSnapshot) {
  if (snapshot.currentDecision.provenance !== 'user' || snapshot.currentDecision.bookkeepingNature !== 'expense'
    || !['business', 'mixed_use'].includes(snapshot.currentDecision.treatment) || snapshot.hasOpenConflictingEvidence) return null
  const classification = classifyOperatingExpense(snapshot)
  if (classification.status !== 'ordinary' || !classification.categoryKey) return null
  const business = snapshot.currentDecision.allocations.filter(allocation => allocation.kind === 'business')
  // A specific existing category is not overwritten by answer-time enrichment.
  if (business.length !== 1 || business.some(allocation => allocation.taxCategoryKey != null)) return null
  return snapshot.currentDecision.allocations.map(allocation => ({ ...allocation,
    taxCategoryKey: allocation.kind === 'business' ? classification.categoryKey : allocation.taxCategoryKey }))
}

export async function finishAnsweredExpense(input: { supabase: SupabaseClient; admin?: SupabaseClient; result: unknown }) {
  if (!input.result || typeof input.result !== 'object' || !('decision' in input.result)
    || ('followUpEvent' in input.result && input.result.followUpEvent)) return
  const decision = input.result.decision
  if (!decision || typeof decision !== 'object' || !('id' in decision) || !('businessId' in decision)
    || !('bookkeepingRecordId' in decision)) return
  const { data: { user } } = await requestUser(input.supabase)
  if (!user) throw new Error('AUTH_REQUIRED')
  const businessId = String(decision.businessId), recordId = String(decision.bookkeepingRecordId)
  // Confirm ownership with the authenticated repository before a trusted read.
  const repository = new SupabaseBookkeepingRepository(input.supabase)
  if (!(await repository.findRecord(businessId, recordId))) throw new Error('BOOKKEEPING_RECORD_UNAVAILABLE')
  const admin = input.admin ?? createServerAdminSupabase()
  let snapshot = await loadBookkeepingEvaluationSnapshot({ admin, businessId, recordId })
  if (snapshot.currentDecision.id !== decision.id) return
  const allocations = answeredExpenseAllocations(snapshot)
  if (allocations) {
    await new CanonicalBookkeepingService(repository).recordDecision({ actor: { businessId, userId: user.id, provenance: 'user' },
      recordId, expectedCurrentDecisionId: snapshot.currentDecision.id,
      decision: { bookkeepingNature: snapshot.currentDecision.bookkeepingNature, treatment: snapshot.currentDecision.treatment,
        reviewStatus: snapshot.currentDecision.reviewStatus, businessPurpose: snapshot.currentDecision.businessPurpose,
        reason: 'Organized the purchase using the customer answer and recorded purchase facts.', allocations } })
    snapshot = await loadBookkeepingEvaluationSnapshot({ admin, businessId, recordId })
  }
  await processOperatingExpenseTreatment({ admin, snapshot })
}
