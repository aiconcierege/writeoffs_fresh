import { createHash } from 'node:crypto'
import type { BookkeepingEvaluationSnapshot } from './deterministic-evaluator'
import { understandMealAnswer } from './meal-answer-understanding'

export const SHARED_EVIDENCE_VERSION = 'bookkeeping-evidence:v1' as const
export type EvidenceSource = { kind: 'record' | 'financial_transaction' | 'receipt_extraction' | 'customer_answer'
  | 'account_use' | 'decision' | 'reusable_fact' | 'category_assessment'; id: string;
  basis: 'observed' | 'inferred' | 'customer_supplied'; provider: string | null; confidence: number | null }
export type ReceiptEvidence = {
  source: EvidenceSource; receiptId: string; linkId: string; quality: string | null;
  merchant: string | null; date: string | null; totalCents: number | null;
  content: string[]; matchState: 'receipt_only' | 'linked_to_financial_activity';
}
export type SharedBookkeepingEvidence = {
  version: typeof SHARED_EVIDENCE_VERSION; fingerprint: string;
  receipts: ReceiptEvidence[];
  observations: Array<{ source: EvidenceSource; fact: string; value: unknown }>;
}

// Document text is data, never an instruction or an assertion of tax treatment.
// Keep bounded visible descriptions, excluding card/account details and commands.
export function visibleReceiptContent(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value.slice(0, 20000).normalize('NFKC').split(/\r?\n/).map(line => line.trim())
    .filter(line => line.length > 1 && line.length <= 200
      && !/\b(?:ignore|instruction|system prompt|deductible|tax deduction|classify|categorize|override|account number|card number|authorization|auth code)\b/i.test(line)
      && !/(?:\d[ -]?){12,19}/.test(line))
    .slice(0, 120)
}
function stable(value: unknown): unknown {
  return Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : value
}
export function buildSharedEvidence(snapshot: BookkeepingEvaluationSnapshot, receipts: ReceiptEvidence[],
  observations: SharedBookkeepingEvidence['observations'] = []): SharedBookkeepingEvidence {
  const source = (kind: EvidenceSource['kind'], id: string, basis: EvidenceSource['basis']): EvidenceSource =>
    ({ kind, id, basis, provider: null, confidence: null })
  const facts = [...observations,
    ...(snapshot.financialOrigin ? [{ source: { ...source('financial_transaction', snapshot.financialOrigin.transactionId, 'observed'),
      provider: snapshot.financialOrigin.kind }, fact: 'financial_origin', value: snapshot.financialOrigin }] : []),
    { source: source('record', snapshot.recordId, 'observed'), fact: 'financial_activity', value: {
      sourceKind: snapshot.sourceKind, amountCents: snapshot.amountCents, date: snapshot.occurredOn,
      currency: snapshot.currency, merchant: snapshot.merchantName, description: snapshot.description,
      providerCategory: snapshot.personalFinanceCategory, movement: snapshot.movement } },
    { source: { ...source('decision', snapshot.currentDecision.id, snapshot.currentDecision.provenance === 'user'
      ? 'customer_supplied' : 'inferred'), confidence: snapshot.currentDecision.confidence ?? null },
      fact: 'current_decision', value: snapshot.currentDecision },
    ...(snapshot.accountUse ? [{ source: source('account_use', snapshot.accountUse.eventId, 'customer_supplied'),
      fact: 'account_use', value: snapshot.accountUse }] : []),
  ].sort((a, b) => `${a.source.kind}:${a.source.id}:${a.fact}`.localeCompare(`${b.source.kind}:${b.source.id}:${b.fact}`))
  const sortedReceipts = [...receipts].sort((a, b) => a.source.id.localeCompare(b.source.id))
  return { version: SHARED_EVIDENCE_VERSION, observations: facts, receipts: sortedReceipts,
    fingerprint: createHash('sha256').update(JSON.stringify(stable({ version: SHARED_EVIDENCE_VERSION,
      observations: facts, receipts: sortedReceipts }))).digest('hex') }
}

/** Candidate purchase descriptors only: never business use, allocation or tax facts. */
export function receiptPurchaseEvidence(snapshot: Pick<BookkeepingEvaluationSnapshot, 'evidence' | 'amountCents'>) {
  return (snapshot.evidence?.receipts ?? []).filter(receipt => receipt.quality === 'usable'
    && receipt.totalCents === Math.abs(snapshot.amountCents ?? 0) && receipt.date != null)
    .map(receipt => ({ source: receipt.source, text: [receipt.merchant, ...receipt.content].filter(Boolean).join(' ') }))
}
export function receiptRestaurantEvidence(snapshot: Pick<BookkeepingEvaluationSnapshot, 'evidence' | 'amountCents'>) {
  return receiptPurchaseEvidence(snapshot).filter(receipt =>
    /\b(?:restaurant|cafe|diner|pizzeria|bistro)\b/i.test(receipt.text)
    && /\b(?:coffee|breakfast|lunch|dinner|meal|sandwich|burger|pizza|salad|sausage|hash brown|tea)\b/i.test(receipt.text))
}

/** A description of food is not a business-meal purpose. Retain legacy facts
 * where no typed answer provenance exists; use explicit spans when it does. */
export function supportedMealPurpose(snapshot: BookkeepingEvaluationSnapshot): string | null {
  const purpose = snapshot.currentDecision.businessPurpose
  if (!purpose) return null
  const describedPurchase = snapshot.evidence?.observations.some(item => item.source.kind === 'customer_answer'
    && item.fact === 'ordinary_expense_purpose' && item.value && typeof item.value === 'object'
    && 'businessPurpose' in item.value && item.value.businessPurpose === purpose)
  return describedPurchase ? understandMealAnswer(purpose).businessPurpose : purpose
}
