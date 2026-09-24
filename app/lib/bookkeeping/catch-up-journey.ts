import { createHash } from 'node:crypto'
import type { WorkAction, WorkContext, WorkRecord } from './betti-work'
import { guidedItem, statementEstablishesBankFee } from './guided-work'
import { purchaseReceiptEligible } from './receipt-eligibility'

export const CATCH_UP_PAGE_SIZE = 20
export type CatchUpStage = 'statements' | 'receipts' | 'personal' | 'nonexpense'
export type CatchUpEvent = {
  business_id: string; id: string; scope_key: string; stage: CatchUpStage
  response: 'continue' | 'later' | 'none' | 'uploaded' | 'reviewed'
  items: { recordId: string; accountUseVersion: string }[]
  document_ids: string[]; created_at: string
}
export type CatchUpJourney = {
  scopeKey: string; stage: CatchUpStage; from: string; through: string
  moreReceipts?: boolean
  reviewRemaining?: number
  missingPeriods?: { from: string; through: string }[]
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const nextDay = (value: string) => new Date(Date.parse(value + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)

/** Pure orchestration over the SAME canonical records. A journey event never
 * grants commercial coverage, establishes business use, or manufactures a match. */
export function catchUpJourney(input: {
  context: WorkContext; records: WorkRecord[]; actions: WorkAction[]
  range: { from: string; through: string } | null
  events: CatchUpEvent[]; pending: (recordId: string) => string[]
}): { action: WorkAction | null; hold: boolean } {
  const { context: c, range, records, events, pending } = input
  if (!range || !records.length) return { action: null, hold: false }
  const scopeKey = hash([c.business.id, range.from, range.through])
  const history = events.filter(e => e.business_id === c.business.id && e.scope_key === scopeKey)
  // Unknown account use is still the prerequisite, not an inferred business fact.
  if (records.some(r => r.account_id && !c.accounts.find(a => a.id === r.account_id)?.designation)) {
    return { action: null, hold: true }
  }
  const dependencies = [...new Set(records.flatMap(r => pending(r.record_id)))].sort()
  const complete = (stage: CatchUpStage) => history.some(e => e.stage === stage && e.response !== 'uploaded')
  const action = (stage: CatchUpStage, selected: WorkRecord[], extra: Partial<CatchUpJourney> = {}): WorkAction => {
    const items = selected.map(r => guidedItem(r, c))
    const journey: CatchUpJourney = { scopeKey, stage, ...range, ...extra }
    return {
      id: `catch-up:${scopeKey}:${stage}:${hash(items.map(i => i.recordId)).slice(0, 16)}`,
      version: hash([journey, items, history.map(e => e.id), dependencies]),
      type: 'catch_up_journey', target: { kind: 'business', id: c.business.id },
      workstream: 'catch_up', affects: ['catch_up'], recordIds: selected.map(r => r.record_id),
      status: dependencies.length ? 'waiting' : 'actionable', availableAt: null,
      href: '/check-in', items, journey, dependencies,
      priority: { score: 0, routingTier: 4, reasons: ['historical_evidence_and_broad_facts_first'],
        unlocks: records.length, ageDays: 0, continuity: false, materiality: null, deadline: null },
    }
  }
  if (!complete('statements')) {
    const missing: { from: string; through: string }[] = []
    for (const account of c.accounts.filter(a => records.some(r => r.account_id === a.id) && ['manual', 'statement'].includes(a.provider ?? ''))) {
      let cursor = range.from
      for (const p of c.coverage.filter(p => p.account_id === account.id && p.validation_status === 'validated'
        && !p.ambiguous_row_count && p.period_start && p.period_end).sort((a, b) => a.period_start!.localeCompare(b.period_start!))) {
        if (p.period_end! < cursor || p.period_start! > range.through) continue
        if (p.period_start! > cursor) missing.push({ from: cursor,
          through: new Date(Date.parse(p.period_start! + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) })
        cursor = cursor > nextDay(p.period_end!) ? cursor : nextDay(p.period_end!)
      }
      if (cursor <= range.through) missing.push({ from: cursor, through: range.through })
    }
    if (missing.length) return { action: action('statements', [], { missingPeriods: missing }), hold: true }
  }
  // Receipt collection is deliberately broader than an expense-only question.
  // It ends only with an explicit done/no-receipts/later response, not an upload.
  const usefulPurchaseEvidence = records.some(r => !statementEstablishesBankFee(r,c)
    && purchaseReceiptEligible({amountCents:r.amount_cents,bookkeepingNature:r.bookkeeping_nature??null,treatment:r.treatment??null}))
  if (!complete('receipts') && (usefulPurchaseEvidence || history.some(e=>e.stage==='receipts'))) return {
    action: action('receipts', [], { moreReceipts: history.some(e => e.stage === 'receipts' && e.response === 'uploaded') }), hold: true,
  }
  if (dependencies.length) return { action: null, hold: true }
  const reviewableOutgoing = records.filter(r => r.source_kind === 'financial_transaction' && r.transaction_id
    && r.review_version && r.decision_id && r.amount_cents < 0 && r.bookkeeping_nature === 'expense'
    && ['business', 'mixed_use'].includes(r.treatment ?? '') && !statementEstablishesBankFee(r, c))
    .sort((a, b) => a.activity_date.localeCompare(b.activity_date) || a.record_id.localeCompare(b.record_id))
  // Unknown outgoing money may be a personal exception. Showing it here does
  // not establish an expense or business use; no-selection records only review.
  const unknownOutgoing = records.filter(r=>r.source_kind==='financial_transaction' && r.transaction_id
    && r.review_version && r.decision_id && r.amount_cents<0 && !r.bookkeeping_nature && r.treatment==='unresolved')
  const reviewed = (stage: CatchUpStage, r: WorkRecord) => history.some(e => e.stage === stage
    && (e.response === 'later' || e.items.some(i => i.recordId === r.record_id
      && i.accountUseVersion === c.accounts.find(a => a.id === r.account_id)?.use_version)))
  const personal = [...reviewableOutgoing, ...unknownOutgoing].filter(r => ['business','unresolved'].includes(r.treatment??'') && !r.customer_authored
    && c.accounts.find(a => a.id === r.account_id)?.designation === 'business_only' && !reviewed('personal', r))
    .sort((a,b)=>a.activity_date.localeCompare(b.activity_date)||a.record_id.localeCompare(b.record_id))
  if (personal.length) return { action: action('personal', personal.slice(0, CATCH_UP_PAGE_SIZE),{reviewRemaining:personal.length}), hold: true }
  const nonexpense = reviewableOutgoing.filter(r => !reviewed('nonexpense', r))
  if (nonexpense.length) return { action: action('nonexpense', nonexpense.slice(0, CATCH_UP_PAGE_SIZE),{reviewRemaining:nonexpense.length}), hold: true }
  return { action: null, hold: false }
}
