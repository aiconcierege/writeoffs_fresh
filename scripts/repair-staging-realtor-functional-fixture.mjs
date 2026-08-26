import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const fail = (message) => { throw new Error(message) }
const need = (name) => process.env[name]?.trim() || fail(`${name} is required.`)
if (need('WRITEOFFS_ENVIRONMENT') !== 'staging') fail('This repair is staging-only.')
const url = need('SUPABASE_URL')
if (new URL(url).host !== need('WRITEOFFS_EXPECTED_SUPABASE_HOST')) fail('The Supabase host is not approved staging.')
const email = need('WRITEOFFS_STAGING_FIXTURE_EMAIL').toLowerCase()
const allowed = new Set(need('WRITEOFFS_STAGING_TEST_USERS').split(',').map((value) => value.trim().toLowerCase()))
if (!allowed.has(email)) fail('The fixture account is not designated for staging tests.')

const admin = createClient(url, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
let user = null
for (let page = 1; page <= 10 && !user; page += 1) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 100 })
  if (result.error) throw result.error
  user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null
  if (result.data.users.length < 100) break
}
if (!user) fail('The designated staging user was not found.')
const businessResult = await admin.from('businesses').select('id').eq('owner_user_id', user.id).single()
if (businessResult.error) throw businessResult.error
const businessId = businessResult.data.id

const [decisionResult, sourceResult, transactionResult, eventResult] = await Promise.all([
  admin.from('bookkeeping_decisions').select('*').eq('business_id', businessId),
  admin.from('bookkeeping_financial_sources').select('bookkeeping_record_id,financial_transaction_id').eq('business_id', businessId).is('revoked_at', null),
  admin.from('financial_transactions').select('id,original_description,transaction_date,amount_cents').eq('business_id', businessId),
  admin.from('bookkeeping_review_events').select('*').eq('business_id', businessId),
])
for (const result of [decisionResult, sourceResult, transactionResult, eventResult]) if (result.error) throw result.error

const supersededDecisions = new Set(decisionResult.data.map((row) => row.supersedes_decision_id).filter(Boolean))
const leafByRecord = new Map(decisionResult.data.filter((row) => !supersededDecisions.has(row.id)).map((row) => [row.bookkeeping_record_id, row]))
const transactionByRecord = new Map(sourceResult.data.map((source) => [source.bookkeeping_record_id, transactionResult.data.find((transaction) => transaction.id === source.financial_transaction_id)]))

function supportedCategory(description = '') {
  if (/META ADS|GOOGLE ADS|ADOBE|CANVA|PHOTOGRAPHY|SIGNS BY TOMORROW/.test(description)) return 'advertising'
  if (/FOLLOW UP BOSS|DOCUSIGN/.test(description)) return 'software-cloud'
  if (/OFFICE DEPOT/.test(description)) return 'office-expense'
  if (/USPS|FEDEX/.test(description)) return 'postage-shipping'
  return null
}

async function loadCurrentDecision(recordId) {
  const result = await admin.from('bookkeeping_decisions').select('*')
    .eq('business_id', businessId).eq('bookkeeping_record_id', recordId)
  if (result.error) throw result.error
  const superseded = new Set(result.data.map((row) => row.supersedes_decision_id).filter(Boolean))
  const leaves = result.data.filter((row) => !superseded.has(row.id))
  if (leaves.length !== 1) fail(`Record ${recordId} does not have exactly one canonical decision leaf.`)
  return leaves[0]
}

let categoryRepairs = 0
for (const recordId of leafByRecord.keys()) {
  const currentDecision = await loadCurrentDecision(recordId)
  if (!['business', 'mixed_use'].includes(currentDecision.treatment) || currentDecision.bookkeeping_nature !== 'expense') continue
  const category = supportedCategory(transactionByRecord.get(recordId)?.original_description)
  const allocationLoad = await admin.from('bookkeeping_allocations').select('*')
    .eq('business_id', businessId).eq('bookkeeping_decision_id', currentDecision.id)
  if (allocationLoad.error) throw allocationLoad.error
  const allocations = allocationLoad.data
  if (!category || allocations.some((row) => row.allocation_kind === 'business' && row.tax_category_key === category)) continue
  const result = await admin.rpc('append_bookkeeping_decision', {
    p_business_id: businessId, p_bookkeeping_record_id: recordId,
    p_expected_current_decision_id: currentDecision.id, p_bookkeeping_nature: currentDecision.bookkeeping_nature,
    p_treatment: currentDecision.treatment, p_review_status: currentDecision.review_status,
    p_provenance: 'system', p_confidence: currentDecision.confidence,
    p_reason: `${currentDecision.reason} Supported category established for the staging fixture.`,
    p_business_purpose: currentDecision.business_purpose,
    p_allocations: allocations.map((allocation) => ({
      kind: allocation.allocation_kind, amount_cents: allocation.amount_cents,
      tax_category_key: allocation.allocation_kind === 'business' ? category : null,
      memo: allocation.memo,
    })),
  })
  if (result.error) throw result.error
  categoryRepairs += 1
}

const supersededEvents = new Set(eventResult.data.map((row) => row.supersedes_event_id).filter(Boolean))
const existingIssueKeys = new Set(eventResult.data.map((row) => row.issue_key))
const invalidOpenEvents = eventResult.data.filter((event) => !supersededEvents.has(event.id)
  && ['opened', 'skipped', 'reopened'].includes(event.event_type)
  && event.question_context?.schemaVersion !== 1
  && !existingIssueKeys.has(`staging-functional-repair:${event.review_issue_id}`))
let questionRepairs = 0
for (const event of invalidOpenEvents) {
  const currentDecision = await loadCurrentDecision(event.bookkeeping_record_id)
  const transaction = transactionByRecord.get(event.bookkeeping_record_id)
  if (!currentDecision || !transaction) continue
  const reason = event.reason === 'BUSINESS_PURPOSE_NEEDED' ? 'BUSINESS_PURPOSE_NEEDED' : 'BUSINESS_USE_UNCLEAR'
  let basedOnDecisionId = currentDecision.id
  if (reason === 'BUSINESS_PURPOSE_NEEDED' && currentDecision.treatment === 'unresolved') {
    const established = await admin.rpc('append_bookkeeping_decision', {
      p_business_id: businessId, p_bookkeeping_record_id: event.bookkeeping_record_id,
      p_expected_current_decision_id: currentDecision.id, p_bookkeeping_nature: 'expense',
      p_treatment: 'business', p_review_status: 'needs_review', p_provenance: 'automation',
      p_confidence: 0.8, p_reason: 'Likely business purchase; factual purpose is still required.',
      p_business_purpose: null, p_allocations: [{ kind: 'business', amount_cents: transaction.amount_cents }],
    })
    if (established.error) throw established.error
    basedOnDecisionId = established.data
  }
  const issueKey = `staging-functional-repair:${event.review_issue_id}`
  const fingerprint = createHash('sha256').update(`${event.id}:${basedOnDecisionId}:${reason}`).digest('hex')
  const opened = await admin.rpc('open_bookkeeping_review_issue_v2', {
    p_business_id: businessId, p_bookkeeping_record_id: event.bookkeeping_record_id,
    p_based_on_decision_id: basedOnDecisionId, p_reason: reason,
    p_issue_key: issueKey, p_context_fingerprint: fingerprint,
    p_question_context: { schemaVersion: 1, reason, merchant: transaction.original_description,
      occurredOn: transaction.transaction_date, amountCents: transaction.amount_cents },
  })
  if (opened.error) throw opened.error
  questionRepairs += 1
}

console.log(JSON.stringify({ businessId, categoryRepairs, questionRepairs }))
