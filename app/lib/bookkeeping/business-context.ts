import { createHash } from 'node:crypto'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import { snapshotEconomicContext } from './evidence-aware-routing'

export const BUSINESS_CONTEXT_VERSION = 'bookkeeping-business-context:v1' as const

export type BusinessContextAssessment = {
  version: typeof BUSINESS_CONTEXT_VERSION
  state: 'established' | 'unknown' | 'conflicting' | 'customer_authoritative'
  basis: 'customer_correction' | 'account_business_only' | 'customer_receipt' | 'none'
  economicContext: 'telecom_service' | 'restaurant_meal' | 'ordinary_expense' | null
  evidenceFingerprint: string
  evidenceReferences: Array<{ kind: string; id: string }>
}

export function businessContextAllocationDomain(snapshot: BookkeepingEvaluationSnapshot) {
  const source = `${snapshot.merchantName ?? ''} ${snapshot.description ?? ''}`.toLowerCase()
  const economic = snapshotEconomicContext(snapshot)
  if (economic?.context === 'telecom_service') return 'telecom' as const
  if (/\b(?:internet|broadband|fiber|comcast|xfinity|cox)\b/.test(source)) return 'internet' as const
  if (/\b(?:vehicle|automobile|auto expense|car expense)\b/.test(source)) return 'vehicle' as const
  return null
}

export function assessBusinessContext(snapshot: BookkeepingEvaluationSnapshot): BusinessContextAssessment {
  const economic = snapshotEconomicContext(snapshot)
  const references: BusinessContextAssessment['evidenceReferences'] = []
  if (snapshot.accountUse?.eventId) references.push({ kind: 'financial_account_use_event', id: snapshot.accountUse.eventId })
  for (const receipt of snapshot.customerProvidedReceipts ?? []) {
    references.push({ kind: 'customer_receipt_upload', id: receipt.uploadEventId })
    references.push({ kind: 'document_link', id: receipt.documentLinkId })
  }
  references.sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
  const evidenceFingerprint = createHash('sha256').update(JSON.stringify({
    version: BUSINESS_CONTEXT_VERSION,
    decisionId: snapshot.currentDecision.id,
    decisionProvenance: snapshot.currentDecision.provenance,
    accountUse: snapshot.accountUse,
    references,
    economic,
    conflict: snapshot.hasOpenConflictingEvidence,
  })).digest('hex')
  const economicContext = economic?.context
    ?? (snapshot.currentDecision.bookkeepingNature === 'expense' ? 'ordinary_expense' : null)
  if (snapshot.currentDecision.provenance === 'user') return {
    version: BUSINESS_CONTEXT_VERSION, state: 'customer_authoritative', basis: 'customer_correction',
    economicContext, evidenceFingerprint, evidenceReferences: references,
  }
  if (snapshot.hasOpenConflictingEvidence) return {
    version: BUSINESS_CONTEXT_VERSION, state: 'conflicting', basis: 'none',
    economicContext, evidenceFingerprint, evidenceReferences: references,
  }
  if (snapshot.accountUse?.designation === 'business_only') return {
    version: BUSINESS_CONTEXT_VERSION, state: 'established', basis: 'account_business_only',
    economicContext, evidenceFingerprint, evidenceReferences: references,
  }
  if ((snapshot.customerProvidedReceipts?.length ?? 0) > 0) return {
    version: BUSINESS_CONTEXT_VERSION, state: 'established', basis: 'customer_receipt',
    economicContext, evidenceFingerprint, evidenceReferences: references,
  }
  return { version: BUSINESS_CONTEXT_VERSION, state: 'unknown', basis: 'none',
    economicContext, evidenceFingerprint, evidenceReferences: references }
}

export function contextDefaultsToBusiness(snapshot: BookkeepingEvaluationSnapshot) {
  const assessment = assessBusinessContext(snapshot)
  if (assessment.state !== 'established' || snapshot.currentDecision.bookkeepingNature !== 'expense') return false
  return !['telecom_service'].includes(assessment.economicContext ?? '')
}
