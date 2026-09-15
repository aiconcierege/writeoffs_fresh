/** Isolated synthetic staging tenants; never resets existing customers or drains their jobs. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { prepareCsvFinancialRows, ingestCsvFinancialActivity } from '../app/lib/bookkeeping/csv-ingestion'
import { SupabaseBookkeepingRepository } from '../app/lib/bookkeeping/supabase-repository'
import { CanonicalBookkeepingService } from '../app/lib/bookkeeping/service'
import { evaluateBookkeepingProcessingJob } from '../app/lib/bookkeeping/processing'
import { getAuthenticatedTaxYearReadiness } from '../app/lib/bookkeeping/tax-year-readiness-service'
import { getAuthenticatedCanonicalReport } from '../app/lib/bookkeeping/reporting-service'
import { createTaxTimeReportPdf } from '../app/lib/bookkeeping/tax-time-report-pdf'
import { canonicalReportCsv } from '../app/lib/bookkeeping/reporting-export'
import { loadCustomerEntitlements } from '../app/lib/membership/entitlements'

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (process.env.WRITEOFFS_ENVIRONMENT !== 'staging' || !url || !anon || !key
  || new URL(url).hostname !== 'sgrqrrxrlglhjuetdtps.supabase.co') throw new Error('Dedicated staging configuration required')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const directory = '/private/tmp/writeoffs-tax-time-proof'
const owned = new Set<string>()
type Fixture = { label: string; businessId: string; userId: string; customer: SupabaseClient; email: string; password: string }
async function checked<T extends { data: unknown; error: unknown }>(operation: PromiseLike<T>): Promise<NonNullable<T['data']>> {
  const result = await operation
  if (result.error) throw result.error
  return result.data as NonNullable<T['data']>
}
async function createFixture(label: string, asset = false, unresolved = false): Promise<Fixture> {
  const nonce = crypto.randomUUID(), email = `tax-time-${label}-${nonce}@staging.writeoffs.invalid`, password = `Fixture-${nonce}!`
  const created = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { synthetic_tax_time_validation: true } }))
  assert(created.user)
  const customer = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } })
  await checked(customer.auth.signInWithPassword({ email, password }))
  const business = await checked(admin.from('businesses').select('id').eq('owner_user_id', created.user.id).single())
  owned.add(business.id)
  await checked(admin.rpc('create_business_membership_grant', { p_business_id: business.id, p_plan: 'business',
    p_starts_at: '2025-01-01T00:00:00Z', p_ends_at: label === 'read-only' ? '2026-08-01T00:00:00Z' : null,
    p_request_key: `tax-time:${nonce}`, p_reason: 'Isolated synthetic Tax-Time Report certification', p_provenance: 'admin', p_actor_user_id: null }))
  await checked(admin.from('businesses').update({ name: `Tax-Time ${label} Studio`, business_description: 'Independent graphic design consulting',
    business_profile_context: 'general', schedule_c_eligibility: 'yes', business_stage: 'existing', business_start_month: '2024-01-01',
    uses_customer_job_materials: 'no', keeps_future_sale_merchandise: 'no', catch_up_start_date: '2025-01-01',
    onboarding_start_method: 'receipts', onboarding_state: 'completed', onboarding_version: 3,
    onboarding_completed_at: '2025-01-01T00:00:00Z' }).eq('id', business.id))
  await checked(customer.rpc('set_business_review_cadence', { p_check_in_weekday: 5, p_timezone_name: 'America/Phoenix', p_effective_from: '2025-01-03', p_request_id: nonce }))
  const input = [{ date: '2025-04-01', description: 'Client design project payment', amount: '10000.00' },
    { date: '2025-04-02', description: asset ? 'Laptop computer equipment' : 'Adobe software subscription', amount: '-1500.00' }]
  const rows = prepareCsvFinancialRows({ mapping: { date: 'date', description: 'description', amount: 'amount' }, rows: input }).rows
  await ingestCsvFinancialActivity({ supabase: customer, rows })
  const records = await checked(customer.from('bookkeeping_records').select('id,amount_cents').eq('business_id', business.id))
  const repository = new SupabaseBookkeepingRepository(customer), service = new CanonicalBookkeepingService(repository)
  for (const record of records) {
    const current = await repository.findCurrentDecision(business.id, record.id)
    assert(current)
    if (unresolved && Number(record.amount_cents) < 0) continue
    await service.recordDecision({ actor: { businessId: business.id, userId: created.user.id, provenance: 'user' }, recordId: record.id,
      expectedCurrentDecisionId: current.id, decision: { bookkeepingNature: Number(record.amount_cents) > 0 ? 'business_income' : 'expense',
        treatment: 'business', reviewStatus: 'resolved', reason: 'Synthetic customer supplied business facts',
        businessPurpose: Number(record.amount_cents) > 0 ? 'Client design project payment' : asset ? 'Laptop computer for client design projects' : 'Adobe software subscription for client work',
        allocations: [{ kind: 'business', amountCents: Number(record.amount_cents), taxCategoryKey: Number(record.amount_cents) < 0 && !asset ? 'software' : null }] } })
  }
  return { label, businessId: business.id, userId: created.user.id, customer, email, password }
}
async function drainFixture(fixture: Fixture) {
  assert(owned.has(fixture.businessId))
  // Claim only this newly created fixture's operational jobs. No global queue drain.
  for (let pass = 0; pass < 50; pass++) {
    const jobs = await checked(admin.from('bookkeeping_processing_jobs').select('*').eq('business_id', fixture.businessId).in('state', ['pending', 'retryable']))
    if (!jobs.length) return
    for (const job of jobs) {
      const lease = crypto.randomUUID()
      const claimed = await checked(admin.from('bookkeeping_processing_jobs').update({ state: 'processing', lease_id: lease,
        lease_expires_at: new Date(Date.now() + 120000).toISOString(), claimed_at: new Date().toISOString() })
        .eq('business_id', fixture.businessId).eq('id', job.id).in('state', ['pending', 'retryable']).select('id'))
      if (!claimed.length) continue
      await evaluateBookkeepingProcessingJob(admin, job, { allowAiShadow: false })
      assert.equal(await checked(admin.rpc('complete_bookkeeping_processing_job', { p_job_id: job.id, p_lease_id: lease })), true)
    }
  }
  throw new Error('Fixture queue did not settle')
}
async function certify(fixture: Fixture, expected: 'ready' | 'needs_attention') {
  const membership = await loadCustomerEntitlements(fixture.customer)
  const readiness = await getAuthenticatedTaxYearReadiness({ supabase: fixture.customer, taxYear: 2025,
    includeDataSourceHealth: !['expired_read_only', 'pending_deletion'].includes(membership.lifecycle) })
  console.log(JSON.stringify({ fixture: fixture.label, status: readiness.status, issues: readiness.issues.map(item => item.code), reviewCount: readiness.reviewItems.length }))
  assert.equal(readiness.status, expected)
  const report = await getAuthenticatedCanonicalReport({ supabase: fixture.customer, periodStart: '2025-01-01', periodEnd: '2025-12-31' })
  assert.equal(readiness.totals.businessIncomeCents, report.businessIncomeCents)
  assert.equal(readiness.totals.businessExpensesCents, report.businessExpensesCents)
  assert.equal(readiness.totals.businessProfitCents, report.businessProfitCents)
  assert.deepEqual(readiness.scheduleCCategories, report.deductibleCategoryTotals)
  assert.deepEqual(readiness.vehicleReports, report.vehicleReports)
  assert(canonicalReportCsv(report).includes('2025-04-01'))
  if (expected === 'ready') {
    await writeFile(`${directory}/staging-${fixture.label}.pdf`, await createTaxTimeReportPdf({ readiness }))
    assert.equal((await getAuthenticatedTaxYearReadiness({ supabase: fixture.customer, taxYear: 2025 })).totals.businessExpensesCents, report.businessExpensesCents)
  }
  return readiness
}
async function main() {
  await mkdir(directory, { recursive: true })
  const ready = await createFixture('ready'), review = await createFixture('review', true), blocked = await createFixture('blocked', false, true)
  const readOnly = await createFixture('read-only')
  // Fixture credentials are private test artifacts, never console output or repository files.
  await writeFile(`${directory}/staging-fixtures.json`, JSON.stringify([ready, review, blocked, readOnly].map(({ label, businessId, userId, email, password }) => ({ label, businessId, userId, email, password }))), { mode: 0o600 })
  for (const fixture of [ready, review, blocked, readOnly]) await drainFixture(fixture)
  assert.equal((await certify(ready, 'ready')).reviewItems.length, 0)
  assert.equal((await certify(review, 'ready')).reviewItems[0].kind, 'potential_capital_asset')
  await certify(blocked, 'needs_attention')
  assert.equal((await loadCustomerEntitlements(readOnly.customer)).lifecycle, 'expired_read_only')
  await certify(readOnly, 'ready')
  const hidden = await checked(ready.customer.from('bookkeeping_records').select('id').eq('business_id', review.businessId))
  assert.deepEqual(hidden, [])
  const asset = (await checked(review.customer.from('bookkeeping_records').select('id').eq('business_id', review.businessId).lt('amount_cents', 0)))[0]
  const repository = new SupabaseBookkeepingRepository(review.customer), current = await repository.findCurrentDecision(review.businessId, asset.id)
  assert(current)
  await new CanonicalBookkeepingService(repository).recordDecision({ actor: { businessId: review.businessId, userId: review.userId, provenance: 'user' }, recordId: asset.id,
    expectedCurrentDecisionId: current.id, decision: { bookkeepingNature: 'expense', treatment: 'business', reviewStatus: 'resolved',
      reason: 'Customer corrected purchase nature', businessPurpose: 'Computer repair service for client work', allocations: [{ kind: 'business', amountCents: -150000, taxCategoryKey: 'repairs' }] } })
  await drainFixture(review)
  assert.equal((await certify({ ...review, label: 'corrected' }, 'ready')).reviewItems.length, 0)
  console.log('Staging canonical totals, category/vehicle read models, corrections, exports, read-only membership and tenant isolation passed.')
}
async function extend() {
  const prior = JSON.parse(await readFile(`${directory}/staging-fixtures.json`, 'utf8')) as Array<Omit<Fixture, 'customer'>>
  const fixture = await createFixture('vehicle-review', true)
  const vehicle = await checked(fixture.customer.from('business_vehicles').insert({ business_id: fixture.businessId,
    slot: 1, display_name: '2023 Toyota RAV4', is_mixed_use: false }).select().single())
  await checked(fixture.customer.rpc('record_vehicle_identity', { p_vehicle_id: vehicle.id, p_expected_event_id: null,
    p_ownership: 'leased', p_business_use_began_on: '2025-01-01', p_lease_started_on: '2025-01-01', p_lease_ended_on: '2027-12-31', p_request_key: crypto.randomUUID() }))
  await checked(fixture.customer.rpc('record_vehicle_tax_year_method', { p_vehicle_id: vehicle.id, p_tax_year: 2025,
    p_expected_event_id: null, p_method: 'actual_expenses', p_request_key: crypto.randomUUID() }))
  await checked(fixture.customer.rpc('record_canonical_mileage', { p_id: crypto.randomUUID(), p_vehicle_id: vehicle.id,
    p_miles_milli: 123456, p_occurred_on: '2025-04-03', p_job_label: 'Design project', p_destination: 'Client studio',
    p_business_purpose: 'Client design meeting', p_request_key: crypto.randomUUID() }))
  await drainFixture(fixture)
  const report = await certify(fixture, 'ready')
  assert.deepEqual(report.reviewItems.map(item => item.kind), ['potential_capital_asset', 'vehicle'])
  assert.equal(report.vehicleReports[0].businessMilesMilli, 123456)
  const saved = { label: fixture.label, businessId: fixture.businessId, userId: fixture.userId, email: fixture.email, password: fixture.password }
  await writeFile(`${directory}/staging-fixtures.json`, JSON.stringify([...prior.map(item => item.label === 'review' ? { ...item, label: 'corrected' } : item), saved]), { mode: 0o600 })
  console.log('Isolated asset plus leased-vehicle review fixture passed.')
}
async function deletionProof() {
  // Destruction is confined to the synthetic tenant created inside this invocation.
  const fixture = await createFixture('permanent-deletion')
  await drainFixture(fixture)
  await certify(fixture, 'ready')
  assert(owned.has(fixture.businessId))
  const identity = await checked(admin.auth.admin.getUserById(fixture.userId))
  assert(identity.user)
  assert.equal(identity.user.user_metadata.synthetic_tax_time_validation, true)
  assert.equal(identity.user.email, fixture.email)
  const requestId = crypto.randomUUID(), lease = crypto.randomUUID(), now = new Date().toISOString()
  const hash = (value: string) => createHash('sha256').update(`synthetic-tax-time-deletion:${value}`).digest('hex')
  await checked(admin.from('account_deletion_requests').insert({ id: requestId, business_id: fixture.businessId,
    owner_user_id: fixture.userId, business_identity_hash: hash(fixture.businessId), user_identity_hash: hash(fixture.userId),
    reason: 'customer_request', status: 'executing', requested_at: now, scheduled_for: now, started_at: now,
    lease_token: lease, lease_expires_at: new Date(Date.now() + 120000).toISOString(), request_key: `synthetic:${requestId}` }))
  await checked(admin.rpc('delete_customer_application_data', { p_request_id: requestId, p_lease_token: lease, p_now: now }))
  await checked(admin.auth.admin.deleteUser(fixture.userId))
  assert.equal(await checked(admin.rpc('complete_account_deletion', { p_request_id: requestId, p_lease_token: lease, p_now: now })), true)
  await assert.rejects(() => getAuthenticatedTaxYearReadiness({ supabase: fixture.customer, taxYear: 2025 }), /AUTH_REQUIRED/)
  assert.deepEqual(await checked(admin.from('businesses').select('id').eq('id', fixture.businessId)), [])
  console.log('Permanently deleted synthetic tenant cannot regenerate its report; canonical deletion completed.')
}
async function newBlocker() {
  const prior = JSON.parse(await readFile(`${directory}/staging-fixtures.json`, 'utf8')) as Array<Omit<Fixture, 'customer'>>
  const fixture = await createFixture('blocked', false, true)
  await drainFixture(fixture)
  await certify(fixture, 'needs_attention')
  const saved = { label: fixture.label, businessId: fixture.businessId, userId: fixture.userId, email: fixture.email, password: fixture.password }
  await writeFile(`${directory}/staging-fixtures.json`, JSON.stringify([...prior.filter(item => item.label !== 'blocked'), saved]), { mode: 0o600 })
}
(process.argv.includes('--new-blocker') ? newBlocker() : process.argv.includes('--delete-proof') ? deletionProof() : process.argv.includes('--extend') ? extend() : main()).catch(error => { console.error('Tax-Time staging certification failed:', error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'unknown'); process.exitCode = 1 })
