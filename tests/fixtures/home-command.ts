import { projectBettiWork, type WorkContext, type WorkRecord } from '../../app/lib/bookkeeping/betti-work'
import type { CustomerQuestion } from '../../app/lib/bookkeeping/customer-questions'
export const homeStates = ['new', 'processing', 'catch-up', 'concurrent', 'current', 'waiting', 'organized', 'recovery', 'held', 'deferred'] as const
export function homeWorkFixture(state: typeof homeStates[number]) {
  const c: WorkContext = { business: { id: 'synthetic-home', start: '2026-01-01', activation: '2026-09-01',
    activationEvidence: '2026-09-01T00:00:00Z', timezone: 'America/Phoenix', coverageStart: '2026-01-01' },
    records: [], accounts: [], jobs: [], documents: [], links: [], coverage: [], deferred: [] }
  const r = (id: string, date: string): WorkRecord => ({ business_id: c.business.id, record_id: id,
    activity_date: date, decision_id: 'decision-' + id, account_id: null, source_kind: 'manual',
    treatment: 'unresolved', bookkeeping_nature: 'expense', amount_cents: -12500, has_receipt: false, receipt_unavailable: false, allocations: [] })
  const question = (record: WorkRecord): CustomerQuestion => ({ id: 'question-' + record.record_id,
    version: 'event-' + record.record_id, recordId: record.record_id, kind: 'business_use', source: 'bookkeeping',
    prompt: 'Was this purchase for your business?', transaction: { merchant: 'Synthetic purchase',
      amountCents: record.amount_cents, date: record.activity_date, currency: 'USD' } })
  let questions: CustomerQuestion[] = []
  if (state !== 'new') c.records = [r('earlier', '2026-05-04')]
  if (state === 'current') c.records = [r('recent', '2026-09-15')]
  if (state === 'concurrent') c.records.push(r('recent', '2026-09-15'))
  if (['catch-up', 'concurrent', 'current'].includes(state)) questions = c.records.map(question)
  if (['processing', 'waiting', 'recovery'].includes(state)) c.jobs = [{ business_id: c.business.id, id: 'job',
    record_id: c.records[0].record_id, receipt_id: null, document_id: 'document', kind: 'document',
    state: state === 'recovery' ? 'dead_letter' : state === 'waiting' ? 'pending' : 'processing',
    available_at: '2026-09-17T12:00:00Z', updated_at: '2026-09-17T12:00:00Z', lease_expires_at: '2026-09-17T13:00:00Z' }]
  if (state === 'organized') { c.records[0].treatment = 'business'; c.records[0].allocations = [{ kind: 'business', amountCents: -12500, category: 'office_expenses' }] }
  if (state === 'deferred') c.deferred = [{ business_id: c.business.id, id: 'defer', issue_id: 'issue', record_id: c.records[0].record_id,
    created_at: '2026-09-17T12:00:00Z', deferred_until: '2026-10-01T00:00:00Z' }]
  return projectBettiWork({ businessId: c.business.id, context: c, questions, asOf: '2026-09-17T12:00:00Z' })
}
