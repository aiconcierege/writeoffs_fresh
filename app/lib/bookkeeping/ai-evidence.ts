import { createHash } from 'node:crypto'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import {
  BOOKKEEPING_AI_EVIDENCE_VERSION,
  type AiBookkeepingEvidence,
  type AiEvidenceId,
} from './ai-shadow-types'

function ageDays(date: string | null, now: Date) {
  if (!date) return null
  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000))
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function buildAiBookkeepingEvidence(
  snapshot: BookkeepingEvaluationSnapshot,
  now = new Date(),
) {
  if (snapshot.currentDecision.treatment !== 'unresolved') return null
  const evidenceIds: AiEvidenceId[] = ['record.source_state']
  if (snapshot.amountCents != null) evidenceIds.push('record.amount')
  if (snapshot.occurredOn) evidenceIds.push('record.date')
  if (snapshot.merchantName) evidenceIds.push('transaction.merchant')
  if (snapshot.description) evidenceIds.push('transaction.description')
  if (snapshot.movement?.accountType) evidenceIds.push('account.type')
  if (snapshot.businessDescription) evidenceIds.push('business.description')
  if (snapshot.activeDocumentCount > 0) evidenceIds.push('documents.presence')
  if (snapshot.customerAnswerCount > 0) evidenceIds.push('customer.answers')

  const evidence: AiBookkeepingEvidence = {
    evidenceVersion: BOOKKEEPING_AI_EVIDENCE_VERSION,
    amountCents: snapshot.amountCents,
    currency: snapshot.currency,
    economicDate: snapshot.occurredOn,
    ageDays: ageDays(snapshot.occurredOn, now),
    sourceKind: snapshot.sourceKind,
    sourceCurrent: snapshot.movement ? snapshot.movement.sourceCurrent && !snapshot.movement.pending : true,
    merchant: snapshot.merchantName,
    description: snapshot.description,
    accountType: snapshot.movement?.accountType ?? null,
    businessDescription: snapshot.businessDescription,
    receiptOrDocumentPresent: snapshot.activeDocumentCount > 0,
    customerAnswerCount: snapshot.customerAnswerCount,
    currentDecision: {
      treatment: 'unresolved',
      provenance: snapshot.currentDecision.provenance,
    },
    availableEvidenceIds: evidenceIds,
  }
  const evidenceFingerprint = createHash('sha256').update(stable({
    evidence,
    currentDecisionId: snapshot.currentDecision.id,
    convergenceEventId: snapshot.convergenceEventId ?? null,
    decisionHistoryLength: snapshot.decisionHistoryLength,
    hasOpenConflictingEvidence: snapshot.hasOpenConflictingEvidence,
  })).digest('hex')
  return { evidence, evidenceFingerprint }
}
