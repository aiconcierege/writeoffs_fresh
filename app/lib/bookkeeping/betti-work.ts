import { createHash } from 'node:crypto'
import type { AuthorizedBookkeepingScope } from './authorized-scope'
import type { CustomerQuestion } from './customer-questions'
import { purchaseReceiptEligible } from './receipt-eligibility'
import {guidedStage,guidedItem,guidedDeferral,GUIDED_BATCH_LIMIT,type GuidedItem,type GuidedReview,type SweepType} from './guided-work'

export const BETTI_WORK_VERSION = 'betti-work:v3-guided-evidence'
export type Workstream = 'catch_up' | 'current' | 'shared' | 'outside_scope' | 'unscoped'
export type ActionType = 'provide_records' | 'account_use' | 'personal_exception_sweep' | 'mixed_use_sweep'
  | 'receipt_upload_sweep' | 'receipt_availability' | 'special_transaction' | 'material_question'
  | 'review_summary' | 'recover_ingestion'
type Owned = { business_id: string }
export type WorkRecord = Owned & {
  merchant?:string;transaction_id?:string;review_version?:string;customer_authored?:boolean
  record_id: string; activity_date: string; account_id: string | null; decision_id: string | null
  treatment: string | null; bookkeeping_nature: string | null; amount_cents: number
  source_kind: string; has_receipt: boolean; receipt_unavailable: boolean
  allocations: { kind: string; amountCents: number; category: string | null }[]
}
export type WorkContext = {
  business: { id: string; start: string | null; activation: string | null; activationEvidence: string | null
    timezone: string; coverageStart: string | null; authorizedScope: AuthorizedBookkeepingScope }
  records: WorkRecord[]
  accounts: (Owned & { id: string; provider?: string;display_name?:string;mask?:string|null; use_version: string | null; designation: string | null })[]
  jobs: (Owned & { id: string; record_id: string | null; document_id: string | null; receipt_id: string | null
    state: string; kind: string; available_at: string; lease_expires_at: string | null; updated_at: string })[]
  documents: (Owned & { id: string; receipt_id: string | null; created_at: string; has_job?: boolean })[]
  links: (Owned & { record_id: string; receipt_id: string; extraction_version?: string | null })[]
  coverage: (Owned & { id: string; account_id: string; document_id: string; period_start: string | null
    period_end: string | null; validation_status: string; ambiguous_row_count: number })[]
  deferred: (Owned & { id: string; issue_id: string; record_id: string | null; deferred_until: string | null; created_at: string; source?: string })[]
  documentRecords?: (Owned & {document_id:string;record_id:string})[]
  questionVersions?: string[]
  guidedReviews?:GuidedReview[]
  specialDeferrals?:(Owned & {id:string;record_id:string;decision_id:string;created_at:string})[]
}
export type WorkAction = {
  id: string; version: string; type: ActionType; target: { kind: 'account' | 'record' | 'question' | 'document' | 'business'; id: string }
  workstream: Workstream; affects: ('catch_up' | 'current')[]; recordIds: string[]
  status: 'actionable' | 'deferred' | 'waiting'; availableAt: string | null
  href: string; question?: CustomerQuestion
  transaction?:{merchant:string;date:string;amountCents:number}
  items?:GuidedItem[];account?:{id:string;name:string;mask:string|null;designation:string|null}
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
  const authorized=scope.authorizedScope
  if (!date || !authorized?.authorizedStart) return 'unscoped'
  if (date < authorized.authorizedStart) return 'outside_scope'
  if (!authorized.currentFrom) return 'unscoped'
  if (authorized.catchUp && date >= authorized.catchUp.from && date <= authorized.catchUp.through) return 'catch_up'
  return 'current'
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
  /** Internal index construction only: collect each action's continuity variant
   * in one pass. Request adapters accept only the single-record hint above. */
  continuityRecordIds?: ReadonlySet<string>
}) {
  const { context: c, asOf } = input
  if (c.business.id !== input.businessId || c.business.authorizedScope.businessId !== input.businessId) throw new Error('Projection business mismatch')
  for (const rows of [c.records, c.accounts, c.jobs, c.documents, c.links, c.coverage, c.deferred, c.documentRecords??[],c.guidedReviews??[],c.specialDeferrals??[]]) {
    if (rows.some(row => row.business_id !== input.businessId)) throw new Error('Projection tenant mismatch')
  }
  // A partial snapshot must not become a precise total or a false completion claim.
  if ((c.specialDeferrals?.length??0)>5000 || c.records.length > 5000 || c.jobs.length > 5000 || c.documents.length > 5000 || c.coverage.length > 5000
    || c.deferred.length > 5000 || c.accounts.length > 500 || c.links.length > 10000 || (c.questionVersions?.length ?? 0) > 10000)
    throw new Error('Projection capacity exceeded')
  const records = [...new Map(c.records.map(r => [r.record_id, r])).values()]
  const byId = new Map(records.map(r => [r.record_id, r]))
  if (input.questions.some(q => q.recordId && !byId.has(q.recordId))) throw new Error('Question record unavailable')
  const stream = (r: WorkRecord) => activityWorkstream(r.activity_date, c.business)
  const scoped = records.filter(r => ['catch_up','current'].includes(stream(r)))
  const scopeVersion = fingerprint([BETTI_WORK_VERSION, c.business])
  const streams = (rs: WorkRecord[]): ('catch_up' | 'current')[] =>
    ['catch_up', 'current'].filter(s => rs.some(r => stream(r) === s)) as ('catch_up' | 'current')[]
  const contextOf = (rs: WorkRecord[]): Workstream => {
    const values = streams(rs)
    return values.length === 2 ? 'shared' : values[0] ?? (rs.length && rs.every(r => stream(r) === 'outside_scope') ? 'outside_scope' : 'unscoped')
  }
  const allJobs = c.jobs.map(j => {
    const recordIds = j.record_id ? [j.record_id] : [...new Set([
      ...c.links.filter(l => l.receipt_id === j.receipt_id || c.documents.some(d => d.id === j.document_id && d.receipt_id === l.receipt_id)).map(l => l.record_id),
      ...(c.documentRecords??[]).filter(l=>l.document_id===j.document_id).map(l=>l.record_id)])]
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
  const jobs=allJobs.filter(j=>j.workstream!=='outside_scope')
  const activeJobIds = (id: string) => jobs.filter(j => j.recordIds.includes(id)).map(j => j.id)
  const actions: WorkAction[] = []
  const add = (type: ActionType, id: string, target: WorkAction['target'], rs: WorkRecord[], evidence: unknown,
    href: string, openedAt: string, extra: Partial<WorkAction> = {}) => {
    const affects = extra.affects ?? streams(rs), ageDays = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(openedAt)) / 86400000))
    const continuity = rs.some(r => r.record_id === input.continuityRecordId || input.continuityRecordIds?.has(r.record_id))
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
      account.use_version, '/check-in', c.business.activationEvidence ?? asOf,
      {account:{id:account.id,name:account.display_name??'Your account',mask:account.mask??null,designation:null}})
  }
  const stages=new Map(scoped.flatMap(r=>{const stage=guidedStage(r,c);return stage?[[r.record_id,stage] as const]:[]}))
  const groups=new Map<string,{stage:SweepType;records:WorkRecord[];deferred:string|null}>()
  for(const r of scoped){const stage=stages.get(r.record_id);if(!stage)continue
    const deferred=guidedDeferral(r,stage,c,asOf),key=[r.account_id,stage,stream(r),deferred??'active',activeJobIds(r.record_id).length?'waiting':'ready'].join(':')
    const group=groups.get(key)??{stage,records:[],deferred};group.records.push(r);groups.set(key,group)
  }
  for(const[key,group]of groups){
    const ordered=group.records.sort((a,b)=>a.activity_date.localeCompare(b.activity_date)||a.record_id.localeCompare(b.record_id))
    for(let offset=0;offset<ordered.length;offset+=GUIDED_BATCH_LIMIT){
      const rs=ordered.slice(offset,offset+GUIDED_BATCH_LIMIT),account=c.accounts.find(a=>a.id===rs[0].account_id)!
      const items=rs.map(r=>guidedItem(r,c)),id=`guided:${group.stage}:${fingerprint(items.map(i=>i.recordId)).slice(0,24)}`
      add(group.stage,id,{kind:'account',id:account.id},rs,[key,items,c.guidedReviews],'/check-in',rs[0].activity_date,
        {items,account:{id:account.id,name:account.display_name??'Your account',mask:account.mask??null,designation:account.designation}})
      const action=actions.at(-1)!
      // Unmatched documents can still supply evidence for any receipt group.
      if(group.stage.startsWith('receipt_')){
        const documentJobs=jobs.filter(j=>!j.recordIds.length)
        action.dependencies=[...new Set([...action.dependencies,...documentJobs.map(j=>j.id)])]
        if(action.dependencies.length)action.status='waiting'
      }
      if(group.deferred){action.status='deferred';action.availableAt=group.deferred}
      action.priority.score+=group.stage==='personal_exception_sweep'||group.stage==='mixed_use_sweep'?100:40
      action.priority.reasons.push('visible_scoped_batch','evidence_before_individual_questions')
    }
  }
  const unknownAccounts = new Set(c.accounts.filter(a => !a.designation).map(a => a.id))
  // Known special natures have existing evidence workflows even without a question row.
  // This is routing, not an inference about principal, interest or refund allocation.
  const specialRecords=new Set(scoped.filter(r=>r.source_kind==='financial_transaction'&&r.treatment==='unresolved'
    &&r.decision_id&&['refund','loan_principal_payment'].includes(r.bookkeeping_nature??'')).map(r=>r.record_id))
  for(const r of scoped.filter(r=>specialRecords.has(r.record_id))){
    if(r.account_id&&unknownAccounts.has(r.account_id))continue
    const deferred=(c.specialDeferrals??[]).filter(d=>d.record_id===r.record_id&&d.decision_id===r.decision_id)
      .sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
    const until=deferred?new Date(Date.parse(deferred.created_at)+7*86400000).toISOString():null
    add('special_transaction',`special:${r.record_id}:evidence`,{kind:'record',id:r.record_id},[r],
      [r.decision_id,r.review_version,deferred?.id],`/check-in?record=${encodeURIComponent(r.record_id)}`,r.activity_date,
      {transaction:{merchant:r.merchant??'Financial activity',date:r.activity_date,amountCents:r.amount_cents},
       ...(until&&until>asOf?{status:'deferred' as const,availableAt:until}:{})})
    actions.at(-1)!.priority.reasons.push('existing_supporting_evidence_workflow')
  }
  const deferredSpecialRecords=new Set<string>()
  for(const d of c.specialDeferrals??[]){
    const r=byId.get(d.record_id),until=new Date(Date.parse(d.created_at)+7*86400000).toISOString()
    if(!r||stages.has(r.record_id)||specialRecords.has(r.record_id)||deferredSpecialRecords.has(r.record_id)||r.decision_id!==d.decision_id
      ||r.treatment!=='unresolved'||!['catch_up','current'].includes(stream(r))||until<=asOf)continue
    if(r.account_id&&unknownAccounts.has(r.account_id))continue
    deferredSpecialRecords.add(r.record_id)
    add('special_transaction',`special:${r.record_id}:deferred`,{kind:'record',id:r.record_id},[r],[r.decision_id,d.id],
      `/check-in?record=${encodeURIComponent(r.record_id)}`,d.created_at,{status:'deferred',availableAt:until,
       transaction:{merchant:r.merchant??'Financial activity',date:r.activity_date,amountCents:r.amount_cents}})
  }
  for (const q of input.questions) {
    const r = q.recordId ? byId.get(q.recordId) : undefined
    if (r && !['catch_up','current'].includes(stream(r))) continue
    if (!r && q.transaction.date && !['catch_up','current'].includes(activityWorkstream(q.transaction.date, c.business))) continue
    const type = r && ['refund', 'loan_principal_payment', 'credit_card_payment'].includes(r.bookkeeping_nature ?? '')
      ? 'special_transaction' : 'material_question'
    const accountDependency = r?.account_id && unknownAccounts.has(r.account_id)
    if (accountDependency) continue // The one account fact replaces these repeated requests.
    if(r&&(stages.has(r.record_id)||specialRecords.has(r.record_id)||deferredSpecialRecords.has(r.record_id)))continue // One scoped guided action owns this dependency.
    add(type, `${q.source ?? 'bookkeeping'}:${q.id}`, { kind: 'question', id: q.id }, r ? [r] : [],
      [q.version, q.contextFingerprint, q.kind, q.prompt, q.guidance, q.options], r ? `/check-in?record=${encodeURIComponent(r.record_id)}` : '/check-in', q.openedAt ?? asOf,
      { question: q,
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
    if (r && !['catch_up','current'].includes(stream(r))) continue
    if (r && (['personal', 'excluded'].includes(r.treatment ?? '')||stages.has(r.record_id)||specialRecords.has(r.record_id)||deferredSpecialRecords.has(r.record_id))) continue
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
  const coverageGaps = c.business.authorizedScope.authorizedStart ? c.accounts.flatMap(a =>
    sourceCoverageGaps(c.business.authorizedScope.authorizedStart!, today, coverage.filter(p => p.accountId === a.id))
      .map(gap => ({ accountId: a.id, ...gap, reason: 'source_coverage_unconfirmed' as const }))) : []
  const knownAccountsThrough = c.business.authorizedScope.authorizedStart && c.accounts.length ? c.accounts.map(a => {
    const gaps = sourceCoverageGaps(c.business.authorizedScope.authorizedStart!, today, coverage.filter(p => p.accountId === a.id))
    return gaps.length ? previousDay(gaps[0].from) : today
  }).sort()[0] : null
  const organizedThrough = knownAccountsThrough && c.business.authorizedScope.authorizedStart && knownAccountsThrough >= c.business.authorizedScope.authorizedStart
    && scoped.every(r => r.activity_date > knownAccountsThrough || workingOrganized(r))
    && !jobs.length && !deduplicated.length && !c.documents.some(d => d.has_job === false)
    ? knownAccountsThrough : null
  return { version: BETTI_WORK_VERSION, businessId: input.businessId, asOf, scopeVersion,
    scope: { bookkeepingStart: c.business.authorizedScope.authorizedStart, liveActivation: c.business.activation,
      activationSource: 'onboarding_completed_at' as const, activationDateConvention: 'UTC' as const, timezone: c.business.timezone,
      commercialCoverageStart: c.business.coverageStart,
      historicalAuthorized: c.business.authorizedScope.historicalAuthorized,
      includedStart: c.business.authorizedScope.includedStart,
      catchUp: c.business.authorizedScope.catchUp,
      current: c.business.authorizedScope.currentFrom ? {from:c.business.authorizedScope.currentFrom} : null,
      knownSourceCoverage: coverage, coverageGaps, sourceUniverseConfirmed: false,
      questionAgePolicy: 'unchanged_canonical_policy' as const },
    betti: { jobs, outsideScopeJobs:allJobs.filter(j=>j.workstream==='outside_scope'), waiting, systemHeld,
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
    readiness: { doneForNow: actionable.length === 0 && jobs.length === 0 && systemHeld.length === 0 && !c.documents.some(d=>d.has_job===false),
      phase: actionable.length ? 'customer_action' : jobs.some(j=>j.status==='processing') ? 'processing'
        : jobs.some(j=>['queued','retry_scheduled'].includes(j.status)) || c.documents.some(d=>d.has_job===false) ? 'received'
        : jobs.length || systemHeld.length ? 'blocked' : records.length && !scoped.length ? 'outside_scope'
        : deferred.length ? 'deferred' : scoped.length ? 'settled' : 'no_records',
      catchUp: !c.business.authorizedScope.historicalAuthorized ? 'not_requested' : !c.business.authorizedScope.authorizedStart || !c.business.activation ? 'scope_unknown' : catchUp.activity === 0 ? 'coverage_unconfirmed'
        : catchUp.organized < catchUp.activity || deduplicated.some(a => a.affects.includes('catch_up'))
          || jobs.some(j => ['catch_up', 'shared', 'unscoped'].includes(j.workstream))
          || c.documents.some(d => d.has_job === false) ? 'work_remaining' : 'available_activity_organized',
      catchUpReviewedThrough: null, booksCurrentThrough: null, knownAccountsOrganizedThrough: organizedThrough,
      throughDateLimitation: 'No canonical complete-source coverage or initial catch-up reviewed snapshot exists.' },
    nextAction: actionable[0] ?? null }
}
