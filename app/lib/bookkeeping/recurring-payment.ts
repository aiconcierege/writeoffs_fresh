import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import { payoutUnderstanding } from './purchase-understanding'
import { loadBookkeepingEvaluationSnapshot } from './evaluation-snapshot'

export type RememberedPayment = { id: string; business_id: string; account_id: string;
  counterparty: string; currency: string; effective_on: string; status: string }
export function applicableRememberedPayment(snapshot: BookkeepingEvaluationSnapshot, facts: RememberedPayment[]) {
  // The existing evidence grammar rejects reversals, loans, conflicting provider
  // categories, stale/pending sources and customer-authored contrary facts.
  const candidate = payoutUnderstanding(snapshot)
  if (!candidate || candidate.invoiceReference || snapshot.hasOpenConflictingEvidence
    || snapshot.evidence?.receipts.some(r => r.quality === 'usable')) return null
  const matches = facts.filter(f => f.status === 'active' && f.business_id === snapshot.businessId
    && f.account_id === snapshot.movement?.financialAccountId && f.currency === snapshot.currency
    && f.counterparty === candidate.counterparty && snapshot.occurredOn && f.effective_on <= snapshot.occurredOn)
  return matches.length === 1 ? matches[0] : null
}

export async function applyRememberedPayment(admin: SupabaseClient, snapshot: BookkeepingEvaluationSnapshot) {
  const candidate = payoutUnderstanding(snapshot)
  if (!candidate || candidate.invoiceReference) return false
  const result = await admin.from('current_recurring_payment_facts').select('*')
    .eq('business_id', snapshot.businessId).eq('account_id', snapshot.movement!.financialAccountId)
    .eq('counterparty', candidate.counterparty)
  if (result.error) throw new Error('REMEMBERED_PAYMENT_READ_FAILED')
  const fact = applicableRememberedPayment(snapshot, result.data ?? [])
  if (!fact) return false
  const fingerprint = await admin.rpc('current_bookkeeping_evidence_fingerprint', {
    p_business_id: snapshot.businessId, p_bookkeeping_record_id: snapshot.recordId,
  })
  if (fingerprint.error || typeof fingerprint.data !== 'string') throw new Error('REMEMBERED_PAYMENT_EVIDENCE_UNAVAILABLE')
  // Bind validation to a snapshot read AFTER the database evidence fence.
  // A changed receipt/provider fact between this read and the locked write fails
  // the SQL fingerprint check, rather than blessing stale in-memory evidence.
  const fresh = await loadBookkeepingEvaluationSnapshot({ admin, businessId: snapshot.businessId, recordId: snapshot.recordId })
  if (fresh.currentDecision.id !== snapshot.currentDecision.id || !applicableRememberedPayment(fresh, [fact])) return false
  const applied = await admin.rpc('apply_remembered_payment', {
    p_business: snapshot.businessId, p_record: snapshot.recordId, p_decision: snapshot.currentDecision.id,
    p_fact: fact.id, p_evidence: fingerprint.data,
  })
  if (applied.error) throw new Error('REMEMBERED_PAYMENT_CHANGED')
  return true
}
