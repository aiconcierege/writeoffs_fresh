import { createHash } from 'node:crypto'
import type { CustomerQuestion } from './customer-questions'
import { purchaseReceiptEligible } from './receipt-eligibility'

export const BETTI_WORK_VERSION = 'betti-work:v1'
export type Workstream = 'catch_up' | 'current' | 'shared' | 'outside_scope' | 'unscoped'
export type ActionType = 'provide_records' | 'account_use' | 'personal_exception_sweep' | 'mixed_use_sweep'
  | 'receipt_upload_sweep' | 'receipt_availability' | 'special_transaction' | 'material_question'
  | 'review_summary' | 'recover_ingestion'
type Owned = { business_id: string }
export type WorkRecord = Owned & {
  record_id: string; activity_date: string; account_id: string | null; decision_id: string | null
  treatment: string | null; bookkeeping_nature: string | null; amount_cents: number
  source_kind: string; has_receipt: boolean; receipt_unavailable: boolean
  allocations: { kind: string; amountCents: number; category: string | null }[]
}
export type WorkContext = {
  business: { id: string; start: string | null; activation: string | null; activationEvidence: string | null
    timezone: string; coverageStart: string | null }
  records: WorkRecord[]
  accounts: (Owned & { id: string; provider?: string; use_version: string | null; designation: string | null })[]
  jobs: (Owned & { id: string; record_id: string | null; document_id: string | null; receipt_id: string | null
    state: string; kind: string; available_at: string; lease_expires_at: string | null; updated_at: string })[]
  documents: (Owned & { id: string; receipt_id: string | null; created_at: string; has_job?: boolean })[]
  links: (Owned & { record_id: string; receipt_id: string; extraction_version?: string | null })[]
  coverage: (Owned & { id: string; account_id: string; document_id: string; period_start: string | null
    period_end: string | null; validation_status: string; ambiguous_row_count: number })[]
  deferred: (Owned & { id: string; issue_id: string; record_id: string | null; deferred_until: string | null; created_at: string; source?: string })[]
  questionVersions?: string[]
}
export type WorkAction = {
  id: string; version: string; type: ActionType; target: { kind: 'account' | 'record' | 'question' | 'document' | 'business'; id: string }
  workstream: Workstream; affects: ('catch_up' | 'current')[]; recordIds: string[]
  status: 'actionable' | 'deferred' | 'waiting'; availableAt: string | null
  href: string; question?: Pick<CustomerQuestion, 'id' | 'version' | 'source' | 'prompt' | 'contextFingerprint'>
  priority: { score: number; reasons: string[]; unlocks: number; ageDays: number; continuity: boolean
    materiality: 'totals' | 'disclosable' | null; deadline: string | null }
  dependencies: string[]
}
export type BettiWorkProjection = ReturnType<typeof projectBettiWork>
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const previousDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)

/** Coverage is an interval assertion, never inferred from transaction density. */
export function sourceCoverageGaps(start: string, through: string, periods: { from: string | null; through: string | null; validated: boolean }[]) {
  const gaps: { from: string; through: string }[] = []
  let cursor = start
  for (const p of periods.filter(p => p.validated && p.from && p.through)
    .sort((a, b) => a.from!.localeCompare(b.from!))) {
    if (p.through! < cursor || p.from! > through) continue
    if (p.from! > cursor) gaps.push({ from: cursor, through: previousDay(p.from!) })
    cursor = nextDay(p.through!) > cursor ? nextDay(p.through!) : cursor
    if (cursor > through) break
  }
  if (cursor <= through) gaps.push({ from: cursor, through })
  return gaps
}

/** Scope is fixed at activation. It deliberately does not use the rolling question-age policy. */
export function activityWorkstream(date: string | null, scope: WorkContext['business']): Workstream {
  if (!date || !scope.start || !scope.activation) return 'unscoped'
  if (date < scope.start) return 'outside_scope'
  return date < scope.activation ? 'catch_up' : 'current'
}

/** Read existing decisions/allocations only. This neither classifies nor changes P&L policy. */
export function workingOrganized(record: WorkRecord): boolean {
  if (!record.decision_id || !record.bookkeeping_nature || !record.treatment || record.treatment === 'unresolved') return false
  if (!record.allocations.length || record.allocations.reduce((sum, a) => sum + a.amountCents, 0) !== record.amount_cents) return false
  if (['personal', 'excluded'].includes(record.treatment)) return true
  if (!['expense', 'refund', 'business_income'].includes(record.bookkeeping_nature)) return true
  const business = record.allocations.filter(a => a.kind === 'business')
  return business.length > 0 && (record.bookkeeping_nature === 'business_income' || business.every(a => Boolean(a.category)))
}

/** Pure projection, with an explicit clock. Never invokes workers or mutation APIs. */
export function projectBettiWork(input: {
  businessId: string; context: WorkContext; questions: CustomerQuestion[]; asOf: string
  continuityRecordId?: string; processingEnabled?: boolean
}) {
  const { context: c, asOf } = input
  if (c.business.id !== input.businessId) throw new Error('Projection business mismatch')
  for (const rows of [c.records, c.accounts, c.jobs, c.documents, c.links, c.coverage, c.deferred]) {
    if (rows.some(row => row.business_id !== input.businessId)) throw new Error('Projection tenant mismatch')
  }
  // A partial snapshot must not become a precise total or a false completion claim.
  if (c.records.length > 5000 || c.jobs.length > 5000 || c.documents.length > 5000 || c.coverage.length > 5000
    || c.deferred.length > 5000 || c.accounts.length > 500 || c.links.length > 10000 || (c.questionVersions?.length ?? 0) > 10000)
    throw new Error('Projection capacity exceeded')
  const records = [...new Map(c.records.map(r => [r.record_id, r])).values()]
  const byId = new Map(records.map(r => [r.record_id, r]))
  if (input.questions.some(q => q.recordId && !byId.has(q.recordId))) throw new Error('Question record unavailable')
  const stream = (r: WorkRecord) => activityWorkstream(r.activity_date, c.business)
  const scoped = records.filter(r => stream(r) !== 'outside_scope')
  const scopeVersion = fingerprint([BETTI_WORK_VERSION, c.business])
  const streams = (rs: WorkRecord[]): ('catch_up' | 'current')[] =>
    ['catch_up', 'current'].filter(s => rs.some(r => stream(r) === s)) as ('catch_up' | 'current')[]
  const contextOf = (rs: WorkRecord[]): Workstream => {
    const values = streams(rs)
    return values.length === 2 ? 'shared' : values[0] ?? (rs.length && rs.every(r => stream(r) === 'outside_scope') ? 'outside_scope' : 'unscoped')
  }
  const jobs = c.jobs.map(j => {
    const recordIds = j.record_id ? [j.record_id] : c.links.filter(l => l.receipt_id === j.receipt_id
      || c.documents.some(d => d.id === j.document_id && d.receipt_id === l.receipt_id)).map(l => l.record_id)
    const rs = recordIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : [])
    const status = j.state === 'processing' && (!j.lease_expires_at || j.lease_expires_at <= asOf) ? 'stale_lease'
      : ['dead_letter', 'unreadable', 'needs_attention'].includes(j.state) ? 'failed_recoverable'
      : input.processingEnabled === false && j.kind === 'document' && ['pending', 'retryable'].includes(j.state) ? 'paused'
      : j.state === 'retryable' ? 'retry_scheduled'
      : j.state === 'pending' ? 'queued' : j.state === 'processing' ? 'processing' : 'held'
    // Unknown document dates remain unscoped; upload time never supplies an activity date.
    return { id: j.id, version: j.updated_at, target: j.document_id ?? j.receipt_id ?? j.record_id,
      documentId: j.document_id, recordIds, workstream: contextOf(rs), status,
      availableAt: j.available_at, leaseExpiresAt: j.lease_expires_at }
  })
  const activeJobIds = (id: string) => jobs.filter(j => j.recordIds.includes(id)).map(j => j.id)
  const actions: WorkAction[] = []
  const add = (type: ActionType, id: string, target: WorkAction['target'], rs: WorkRecord[], evidence: unknown,
    href: string, openedAt: string, extra: Partial<WorkAction> = {}) => {
    const affects = extra.affects ?? streams(rs), ageDays = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(openedAt)) / 86400000))
    const continuity = rs.some(r => r.record_id === input.continuityRecordId)
    const unlocks = type === 'account_use' ? rs.filter(r => !workingOrganized(r)).length : rs.length
    // Explainable utility, not a fixed stream quota. Aging is unbounded to prevent starvation.
    const reasons = [type === 'account_use' ? 'account_prerequisite' : type === 'recover_ingestion'
      ? 'recover_failed_ingestion' : type === 'provide_records' ? 'source_prerequisite' : 'material_customer_fact']
    let score = ageDays * 2 + Math.min(unlocks, 100) * 20
    if (type === 'account_use') score += 150
    if (affects.includes('current')) { score += 60; reasons.push('keep_current_fresh') }
    if (ageDays) reasons.push('age_protection')
    if (unlocks > 1) reasons.push('unlocks_multiple_records')
    if (continuity) { score += 180; reasons.push('conversation_continuity') }
    const dependencies = type === 'account_use' ? [] : [...new Set(rs.flatMap(r => activeJobIds(r.record_id)))].sort()
    actions.push({ id, version: fingerprint([scopeVersion, id, evidence, rs.map(r => [r.record_id, r.decision_id]).sort(),
      c.links.filter(l => rs.some(r => r.record_id === l.record_id)).map(l => [l.record_id, l.receipt_id, l.extraction_version]).sort(),
      jobs.filter(j => dependencies.includes(j.id)).map(j => [j.id, j.version, j.status]).sort()]),
      type, target, workstream: contextOf(rs), affects, recordIds: rs.map(r => r.record_id).sort(),
      status: dependencies.length ? 'waiting' : 'actionable', availableAt: null, href,
      priority: { score, reasons, unlocks, ageDays, continuity, materiality: null, deadline: null }, dependencies, ...extra })
  }
  for (const account of c.accounts.filter(a => !a.designation)) {
    const rs = scoped.filter(r => r.account_id === account.id)
    if (!rs.length) continue
    add('account_use', `account:${account.id}:use`, { kind: 'account', id: account.id }, rs,
      account.use_version, account.provider && account.provider !== 'statement' ? '/settings/banking'
        : `/check-in?record=${encodeURIComponent(rs[0].record_id)}`, c.business.activationEvidence ?? asOf)
  }
  const unknownAccounts = new Set(c.accounts.filter(a => !a.designation).map(a => a.id))
  for (const q of input.questions) {
    const r = q.recordId ? byId.get(q.recordId) : undefined
    if (r && stream(r) === 'outside_scope') continue
    if (!r && activityWorkstream(q.transaction.date, c.business) === 'outside_scope') continue
    const type = r && ['refund', 'loan_principal_payment', 'credit_card_payment'].includes(r.bookkeeping_nature ?? '')
      ? 'special_transaction' : 'material_question'
    const accountDependency = r?.account_id && unknownAccounts.has(r.account_id) && q.kind === 'business_use'
    if (accountDependency) continue // The one account fact replaces these repeated requests.
    add(type, `${q.source ?? 'bookkeeping'}:${q.id}`, { kind: 'question', id: q.id }, r ? [r] : [],
      [q.version, q.contextFingerprint, q.kind, q.prompt, q.guidance, q.options], r ? `/check-in?record=${encodeURIComponent(r.record_id)}` : '/check-in', q.openedAt ?? asOf,
      { question: { id: q.id, version: q.version, source: q.source, prompt: q.prompt, contextFingerprint: q.contextFingerprint },
        ...(!r && q.transaction.date ? { workstream: activityWorkstream(q.transaction.date, c.business),
          affects: ['catch_up', 'current'].filter(s => s === activityWorkstream(q.transaction.date, c.business)) as ('catch_up' | 'current')[] } : {}),
        ...(q.availableAt && q.availableAt > asOf ? { status: 'deferred' as const, availableAt: q.availableAt } : {}) })
    const action = actions[actions.length - 1]
    action.priority.materiality = q.materiality ?? null
    if (q.materiality === 'totals') {
      action.priority.score += 20
      action.priority.reasons.push('affects_working_totals')
    }
  }
  for (const d of c.deferred.filter(d => (!d.deferred_until || d.deferred_until > asOf)
    && !input.questions.some(q => q.version === d.id || q.id === d.issue_id))) {
    const r = d.record_id ? byId.get(d.record_id) : undefined
    if (r && stream(r) === 'outside_scope') continue
    if (r && ['personal', 'excluded'].includes(r.treatment ?? '')) continue
    add('material_question', `${d.source ?? 'bookkeeping'}:${d.issue_id}`, { kind: 'question', id: d.issue_id }, r ? [r] : [], d.id,
      r ? `/check-in?record=${encodeURIComponent(r.record_id)}` : '/check-in', d.created_at,
      { status: 'deferred', availableAt: d.deferred_until })
  }
  for (const j of jobs.filter(j => j.status === 'failed_recoverable' && j.documentId)) {
    add('recover_ingestion', `recover:${j.documentId}`, { kind: 'document', id: j.documentId! }, [], j.version,
      '/import', asOf)
  }
  if (!records.length && !c.documents.length && !c.jobs.length) {
    add('provide_records', `records:${input.businessId}`, { kind: 'business', id: input.businessId }, [], scopeVersion,
      '/import', asOf)
  }
  const deduplicated = [...new Map(actions.map(a => [a.id, a])).values()]
    .sort((a, b) => b.priority.score - a.priority.score || a.id.localeCompare(b.id))
  const actionable = deduplicated.filter(a => a.status === 'actionable')
  const deferred = deduplicated.filter(a => a.status === 'deferred')
  const waiting = deduplicated.filter(a => a.status === 'waiting')
  const systemHeld = scoped.filter(r => !workingOrganized(r) && !activeJobIds(r.record_id).length
    && !deduplicated.some(a => a.recordIds.includes(r.record_id)))
    .map(r => ({ recordId: r.record_id, workstream: stream(r), reason: 'no_current_customer_action' as const,
      recovery: 'canonical_review_or_support' as const }))
  const progress = (s: 'catch_up' | 'current') => {
    const rs = scoped.filter(r => stream(r) === s)
    return { activity: rs.length, organized: rs.filter(workingOrganized).length,
      processing: rs.filter(r => jobs.some(j => j.recordIds.includes(r.record_id)
        && ['queued', 'processing', 'retry_scheduled'].includes(j.status))).length,
      blocked: rs.filter(r => jobs.some(j => j.recordIds.includes(r.record_id)
        && ['failed_recoverable', 'stale_lease', 'paused', 'held'].includes(j.status))).length,
      customerActions: actionable.filter(a => a.affects.includes(s)).length,
      documentationLimitations: rs.filter(r => !r.has_receipt && purchaseReceiptEligible({ amountCents: r.amount_cents,
        bookkeepingNature: r.bookkeeping_nature, treatment: r.treatment })).length }
  }
  const catchUp = progress('catch_up'), current = progress('current')
  const coverage = c.coverage.map(p => ({ accountId: p.account_id, from: p.period_start, through: p.period_end,
    sourceId: p.id, source: 'statement' as const, validated: p.validation_status === 'validated' && p.ambiguous_row_count === 0 }))
  // Statements prove individual account periods, not completeness of the customer's source universe.
  const today = asOf.slice(0, 10)
  const coverageGaps = c.business.start ? c.accounts.flatMap(a =>
    sourceCoverageGaps(c.business.start!, today, coverage.filter(p => p.accountId === a.id))
      .map(gap => ({ accountId: a.id, ...gap, reason: 'source_coverage_unconfirmed' as const }))) : []
  const knownAccountsThrough = c.business.start && c.accounts.length ? c.accounts.map(a => {
    const gaps = sourceCoverageGaps(c.business.start!, today, coverage.filter(p => p.accountId === a.id))
    return gaps.length ? previousDay(gaps[0].from) : today
  }).sort()[0] : null
  const organizedThrough = knownAccountsThrough && c.business.start && knownAccountsThrough >= c.business.start
    && scoped.every(r => r.activity_date > knownAccountsThrough || workingOrganized(r))
    && !jobs.length && !deduplicated.length && !c.documents.some(d => d.has_job === false)
    ? knownAccountsThrough : null
  return { version: BETTI_WORK_VERSION, businessId: input.businessId, asOf, scopeVersion,
    scope: { bookkeepingStart: c.business.start, liveActivation: c.business.activation,
      activationSource: 'onboarding_completed_at' as const, activationDateConvention: 'UTC' as const, timezone: c.business.timezone,
      commercialCoverageStart: c.business.coverageStart,
      catchUp: c.business.start && c.business.activation && c.business.start < c.business.activation
        ? { from: c.business.start, through: previousDay(c.business.activation) } : null,
      current: c.business.activation ? { from: c.business.activation } : null,
      knownSourceCoverage: coverage, coverageGaps, sourceUniverseConfirmed: false,
      questionAgePolicy: 'unchanged_canonical_policy' as const },
    betti: { jobs, waiting, systemHeld,
      missingJobs: c.documents.filter(d => d.has_job === false).map(d => ({ documentId: d.id, reason: 'no_job_recorded' as const })),
      genuinelyProcessing: jobs.filter(j => j.status === 'processing').length,
      queued: jobs.filter(j => j.status === 'queued').length, retryScheduled: jobs.filter(j => j.status === 'retry_scheduled').length,
      failures: jobs.filter(j => ['failed_recoverable', 'stale_lease', 'paused'].includes(j.status)) },
    customer: { actionable, deferred, actionableCount: actionable.length, deferredCount: deferred.length,
      sharedCount: actionable.filter(a => a.workstream === 'shared').length },
    progress: { catchUp, current, totalCanonicalActivity: records.length,
      unscopedActivity: records.filter(r => stream(r) === 'unscoped').length,
      outsideScopeActivity: records.filter(r => stream(r) === 'outside_scope').length, completedCustomerActions: null,
      organizedMeaning: 'working_treatment_established_not_tax_documentation_complete' as const },
    readiness: { doneForNow: actionable.length === 0,
      catchUp: !c.business.start || !c.business.activation ? 'scope_unknown' : catchUp.activity === 0 ? 'coverage_unconfirmed'
        : catchUp.organized < catchUp.activity || deduplicated.some(a => a.affects.includes('catch_up'))
          || jobs.some(j => ['catch_up', 'shared', 'unscoped'].includes(j.workstream))
          || c.documents.some(d => d.has_job === false) ? 'work_remaining' : 'available_activity_organized',
      catchUpReviewedThrough: null, booksCurrentThrough: null, knownAccountsOrganizedThrough: organizedThrough,
      throughDateLimitation: 'No canonical complete-source coverage or initial catch-up reviewed snapshot exists.' },
    nextAction: actionable[0] ?? null }
}
