import { describe, expect, it } from 'vitest'
import { activityWorkstream, projectBettiWork, sourceCoverageGaps, type WorkContext, type WorkRecord } from '../../app/lib/bookkeeping/betti-work'
import type { CustomerQuestion } from '../../app/lib/bookkeeping/customer-questions'

const now = '2026-09-17T12:00:00Z'
function context(): WorkContext {
  return { business: { id: 'a', start: '2026-01-01', activation: '2026-09-01', activationEvidence: '2026-09-01T12:00:00Z',
    timezone: 'America/Phoenix', coverageStart: '2026-01-01' }, records: [], accounts: [], jobs: [], documents: [], links: [], coverage: [], deferred: [] }
}
function record(id = 'old', date = '2026-05-03'): WorkRecord {
  return { business_id: 'a', record_id: id, activity_date: date, account_id: 'account', decision_id: 'decision-' + id,
    treatment: 'unresolved', bookkeeping_nature: 'expense', amount_cents: -2299, source_kind: 'financial_transaction',
    has_receipt: false, receipt_unavailable: false, allocations: [] }
}
function question(r: WorkRecord): CustomerQuestion {
  return { id: 'q-' + r.record_id, version: 'v1', source: 'bookkeeping', kind: 'business_use', recordId: r.record_id,
    prompt: 'Was this for your business?', openedAt: now, contextFingerprint: 'evidence1',
    transaction: { merchant: 'Example', amountCents: r.amount_cents, currency: 'USD', date: r.activity_date } }
}
function job(recordId: string | null = 'old') {
  return { business_id: 'a', id: 'job', record_id: recordId, document_id: recordId ? null : 'document', receipt_id: null,
    state: 'processing', kind: recordId ? 'bookkeeping' : 'document', available_at: now,
    lease_expires_at: '2026-09-17T12:05:00Z', updated_at: now }
}
function organized(r: WorkRecord) {
  r.treatment = 'business'; r.allocations = [{ kind: 'business', amountCents: r.amount_cents, category: 'software' }]
  return r
}
function project(c: WorkContext, questions: CustomerQuestion[] = []) {
  return projectBettiWork({ businessId: 'a', context: c, questions, asOf: now })
}
describe('read-only Betti work projection', () => {
  it('1: new customer needs records; empty is not caught up', () => {
    const p = project(context())
    expect(p.nextAction?.type).toBe('provide_records')
    expect(p.readiness.booksCurrentThrough).toBeNull()
    expect(p.readiness.catchUp).toBe('coverage_unconfirmed')
  })
  it('2: catch-up processing creates no customer task', () => {
    const c = context(); c.records = [record()]; c.jobs = [job()]
    const p = project(c)
    expect(p.betti.genuinelyProcessing).toBe(1)
    expect(p.customer.actionableCount).toBe(0)
    expect(p.progress.catchUp.processing).toBe(1)
  })
  it.each([['3: catch-up', '2026-05-03', 'catch_up'], ['4: current', '2026-09-01', 'current']])('%s question', (_, date, stream) => {
    const c = context(); c.records = [record('r', date)]
    expect(project(c, [question(c.records[0])]).nextAction?.workstream).toBe(stream)
  })
  it('5: concurrent streams share one ledger and favor useful current action, not quotas', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    const p = project(c, c.records.map(question))
    expect(p.customer.actionableCount).toBe(2)
    expect(p.nextAction?.workstream).toBe('current')
    expect(p.nextAction?.priority.reasons).toContain('keep_current_fresh')
  })
  it('6: account prerequisite is one shared action, not two stream tasks', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    c.accounts = [{ business_id: 'a', id: 'account', designation: null, use_version: null }]
    const p = project(c, c.records.map(question))
    expect(p.customer.actionableCount).toBe(1)
    expect(p.customer.sharedCount).toBe(1)
    expect(p.nextAction?.affects).toEqual(['catch_up', 'current'])
    expect(p.nextAction?.priority.unlocks).toBe(2)
  })
  it('7: a slow catch-up document cannot block unrelated current work', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]; c.jobs = [job()]
    const p = project(c, c.records.map(question))
    expect(p.customer.actionableCount).toBe(1)
    expect(p.betti.waiting).toHaveLength(1)
    expect(p.nextAction?.recordIds).toEqual(['new'])
  })
  it('8: deferred catch-up stays distinct from actionable current', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    c.deferred = [{ business_id: 'a', id: 'skip', issue_id: 'q-old', record_id: 'old', deferred_until: '2026-10-01', created_at: now }]
    const p = project(c, [question(c.records[1])])
    expect(p.customer.deferredCount).toBe(1)
    expect(p.customer.actionableCount).toBe(1)
    expect(p.nextAction?.workstream).toBe('current')
  })
  it('9: missing/unavailable receipt does not unorganize supported working expense', () => {
    const c = context(); c.records = [organized(record())]; c.records[0].receipt_unavailable = true
    const p = project(c)
    expect(p.progress.catchUp.organized).toBe(1)
    expect(p.progress.catchUp.documentationLimitations).toBe(1)
    expect(p.betti.systemHeld).toHaveLength(0)
    expect(p.customer.actionableCount).toBe(0)
    expect(c.records[0].allocations[0].amountCents).toBe(-2299)
  })
  it('10: late uploads classify by activity date, without copying records', () => {
    const c = context(); c.records = [record()]
    c.documents = [{ business_id: 'a', id: 'd', receipt_id: null, created_at: now }]
    expect(project(c).progress.catchUp.activity).toBe(1)
    expect(project(c).progress.current.activity).toBe(0)
  })
  it('11: new current work coexists with incomplete catch-up and never ages into it', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    const p = projectBettiWork({ businessId: 'a', context: c, questions: c.records.map(question), asOf: '2027-01-01T00:00:00Z' })
    expect(p.progress.current.activity).toBe(1)
    expect(p.progress.catchUp.activity).toBe(1)
  })
  it('12: no customer actions can coexist with real document processing', () => {
    const c = context(); c.jobs = [job(null)]
    const p = project(c)
    expect(p.readiness.doneForNow).toBe(true)
    expect(p.betti.genuinelyProcessing).toBe(1)
    expect(p.betti.jobs[0].workstream).toBe('unscoped')
  })
  it('13: unresolved with no question/job is a hold, not processing or a customer task', () => {
    const c = context(); c.records = [record()]
    const p = project(c)
    expect(p.betti.genuinelyProcessing).toBe(0)
    expect(p.betti.systemHeld).toHaveLength(1)
    expect(p.customer.actionableCount).toBe(0)
  })
  it('14: expired lease and terminal failure are not described as active processing', () => {
    const c = context(); c.jobs = [{ ...job(), lease_expires_at: '2026-09-16T00:00:00Z' }, { ...job(null), id: 'failed', state: 'dead_letter' }]
    const p = project(c)
    expect(p.betti.genuinelyProcessing).toBe(0)
    expect(p.betti.failures.map(j => j.status)).toEqual(['stale_lease', 'failed_recoverable'])
  })
  it('15: organized within known coverage does not invent whole-business current-through', () => {
    const c = context(); c.records = [organized(record('new', '2026-09-15'))]
    c.coverage = [{ business_id: 'a', id: 'period', account_id: 'account', document_id: 'document', period_start: '2026-09-01',
      period_end: '2026-09-16', validation_status: 'validated', ambiguous_row_count: 0 }]
    const p = project(c)
    expect(p.progress.current.organized).toBe(1)
    expect(p.scope.knownSourceCoverage[0].through).toBe('2026-09-16')
    expect(p.readiness.doneForNow).toBe(true)
    expect(p.readiness.booksCurrentThrough).toBeNull()
  })
  it('16: scope expansion includes only newly in-scope work, preserving established decisions', () => {
    const c = context(); c.business.start = '2026-05-01'
    c.records = [organized(record()), record('earlier', '2026-02-01')]
    const before = project(c, [question(c.records[1])])
    c.business.start = '2026-01-01'
    const after = project(c, [question(c.records[1])])
    expect(before.customer.actionableCount).toBe(0)
    expect(after.customer.actionableCount).toBe(1)
    expect(after.progress.catchUp.organized).toBe(1)
    expect(after.scopeVersion).not.toBe(before.scopeVersion)
    expect(after.readiness.catchUpReviewedThrough).toBeNull()
  })
  it('17: fails closed on another tenant in any source collection', () => {
    for (const key of ['records', 'accounts', 'jobs', 'documents', 'links', 'coverage', 'deferred'] as const) {
      const c = context(); (c[key] as { business_id: string }[]).push({ business_id: 'b' })
      expect(() => project(c)).toThrow('tenant mismatch')
    }
    const c = context(); c.business.id = 'b'; expect(() => project(c)).toThrow('business mismatch')
    expect(() => project(context(), [question(record('foreign'))])).toThrow('Question record unavailable')
  })
  it('18: version identity stable across reads but changes with canonical evidence', () => {
    const c = context(); c.records = [record()]; const q = question(c.records[0])
    const before = project(c, [q]).nextAction!
    expect(project(c, [q]).nextAction?.version).toBe(before.version)
    q.contextFingerprint = 'new-evidence'
    expect(project(c, [q]).nextAction?.version).not.toBe(before.version)
    expect(project(c, [q]).nextAction?.id).toBe(before.id)
    const evidenceVersion = project(c, [q]).nextAction?.version
    c.links = [{ business_id: 'a', record_id: 'old', receipt_id: 'receipt', extraction_version: 'extraction-v2' }]
    expect(project(c, [q]).nextAction?.version).not.toBe(evidenceVersion)
  })
  it('does not mutate its inputs; multiple category allocations remain intact', () => {
    const c = context(); c.records = [organized(record())]
    c.records[0].allocations = [{ kind: 'business', amountCents: -1000, category: 'software' }, { kind: 'business', amountCents: -1299, category: 'supplies' }]
    const saved = JSON.stringify(c); project(c); expect(JSON.stringify(c)).toBe(saved)
    expect(project(c).progress.catchUp.organized).toBe(1)
  })
  it('unknown activation and pre-start records do not invent stream membership', () => {
    const c = context(); expect(activityWorkstream('2025-12-31', c.business)).toBe('outside_scope')
    c.business.activation = null; expect(activityWorkstream('2026-05-01', c.business)).toBe('unscoped')
  })
  it('account leverage and age can outweigh current preference', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    const qs = c.records.map(question); qs[0].openedAt = '2026-01-01T00:00:00Z'
    expect(project(c, qs).nextAction?.workstream).toBe('catch_up')
  })
  it('coverage exposes gaps, including between uploaded periods', () => {
    expect(sourceCoverageGaps('2026-01-01', '2026-09-17', [
      { from: '2026-05-01', through: '2026-05-31', validated: true },
      { from: '2026-07-01', through: '2026-08-31', validated: true },
    ])).toEqual([{ from: '2026-01-01', through: '2026-04-30' },
      { from: '2026-06-01', through: '2026-06-30' }, { from: '2026-09-01', through: '2026-09-17' }])
  })
  it('can certify organized activity through a date within known accounts only', () => {
    const c = context(); c.business.start = '2026-09-01'
    c.accounts = [{ business_id: 'a', id: 'account', use_version: 'use', designation: 'business_only' }]
    c.records = [organized(record('new', '2026-09-15'))]
    c.coverage = [{ business_id: 'a', id: 'p', account_id: 'account', document_id: 'd', period_start: '2026-09-01',
      period_end: '2026-09-16', validation_status: 'validated', ambiguous_row_count: 0 }]
    expect(project(c).readiness.knownAccountsOrganizedThrough).toBe('2026-09-16')
    expect(project(c).readiness.booksCurrentThrough).toBeNull()
  })
  it('actual retry/paused/orphan states do not claim active processing', () => {
    const c = context(); c.jobs = [{ ...job(null), state: 'retryable' }]
    c.documents = [{ business_id: 'a', id: 'orphan', receipt_id: null, created_at: now, has_job: false }]
    const p = projectBettiWork({ businessId: 'a', context: c, questions: [], asOf: now, processingEnabled: false })
    expect(p.betti.genuinelyProcessing).toBe(0)
    expect(p.betti.jobs[0].status).toBe('paused')
    expect(p.betti.missingJobs).toHaveLength(1)
  })
  it('answered questions never reappear merely because projection is read again', () => {
    const c = context(); c.records = [record()]
    const q = question(c.records[0]); expect(project(c, [q]).customer.actionableCount).toBe(1)
    expect(project(c, []).customer.actionableCount).toBe(0)
    c.records[0] = organized(c.records[0])
    expect(project(c, []).customer.actionableCount).toBe(0)
  })
})
