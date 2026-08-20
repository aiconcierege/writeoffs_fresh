import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { drainBookkeepingProcessingJobs } from '../../app/lib/bookkeeping/processing'
import { getAuthenticatedCanonicalReport } from '../../app/lib/bookkeeping/reporting-service'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

async function createAccount(input: {
  admin: SupabaseClient
  businessId: string
  type: 'checking' | 'savings' | 'credit_card'
  label: string
}) {
  const identity = `${input.label}-${crypto.randomUUID()}`
  const id = crypto.randomUUID()
  execFileSync('docker', ['exec', 'supabase_db_writeoffs_fresh', 'psql',
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    `insert into public.financial_accounts
      (id,business_id,provider,provider_connection_id,provider_account_id,
       institution_name,display_name,account_type,currency)
     values ('${id}','${input.businessId}','plaid','item-${identity}','${identity}',
       'Deterministic test institution','${input.label}','${input.type}','USD')`],
  { stdio: 'pipe' })
  return id
}

async function createCanonicalMovement(input: {
  admin: SupabaseClient
  customer: SupabaseClient
  businessId: string
  accountId: string
  amountCents: number
  date: string
  primary?: string
  detailed?: string
  description: string
}) {
  const identity = crypto.randomUUID()
  const transactionId = crypto.randomUUID()
  const rawPayload = JSON.stringify({
      schema_version: 1,
      provider: 'plaid',
      provider_evidence: {
        personal_finance_category: input.primary && input.detailed
          ? { primary: input.primary, detailed: input.detailed }
          : null,
      },
    })
  execFileSync('docker', ['exec', 'supabase_db_writeoffs_fresh', 'psql',
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    `insert into public.financial_transactions
      (id,business_id,financial_account_id,external_transaction_id,source_fingerprint,
       import_method,original_description,amount_cents,currency,transaction_date,pending,raw_payload)
     values ('${transactionId}','${input.businessId}','${input.accountId}','${identity}','${identity}',
       'provider','${input.description}',${input.amountCents},'USD','${input.date}',false,
       '${rawPayload}'::jsonb)`],
  { stdio: 'pipe' })
  const { data: record, error: recordError } = await input.admin.rpc('ensure_bookkeeping_record', {
    p_business_id: input.businessId,
    p_source_kind: 'financial_transaction',
    p_financial_transaction_id: transactionId,
    p_provenance: 'import',
    p_ingestion_key: `evaluator-test:${identity}`,
    p_amount_cents: input.amountCents,
    p_currency: 'USD',
    p_occurred_on: input.date,
  })
  if (recordError) throw recordError
  const recordId = Array.isArray(record) ? record[0].id : record.id
  const { error: decisionError } = await input.customer.rpc('ensure_initial_bookkeeping_decision', {
    p_business_id: input.businessId,
    p_bookkeeping_record_id: recordId,
  })
  if (decisionError) throw decisionError
  return recordId as string
}

suite('deterministic bookkeeping evaluator v1 against local PostgreSQL', () => {
  it('resolves structural transfers and card payments while ambiguous activity stays unresolved', async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({
      admin, url: url!, anonKey: anonKey!, label: 'evaluator-v1', amounts: [],
    })
    const checking = await createAccount({
      admin, businessId: owner.businessId, type: 'checking', label: 'Checking',
    })
    const savings = await createAccount({
      admin, businessId: owner.businessId, type: 'savings', label: 'Savings',
    })
    const card = await createAccount({
      admin, businessId: owner.businessId, type: 'credit_card', label: 'Card',
    })
    const transferOut = await createCanonicalMovement({
      admin, customer: owner.customer, businessId: owner.businessId, accountId: checking, amountCents: -25_000,
      date: '2026-08-10', primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
      description: 'Connected account transfer',
    })
    const transferIn = await createCanonicalMovement({
      admin, customer: owner.customer, businessId: owner.businessId, accountId: savings, amountCents: 25_000,
      date: '2026-08-11', primary: 'TRANSFER_IN', detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
      description: 'Connected account transfer',
    })
    const cardOut = await createCanonicalMovement({
      admin, customer: owner.customer, businessId: owner.businessId, accountId: checking, amountCents: -12_345,
      date: '2026-08-15', primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      description: 'Card payment',
    })
    const cardIn = await createCanonicalMovement({
      admin, customer: owner.customer, businessId: owner.businessId, accountId: card, amountCents: 12_345,
      date: '2026-08-16', primary: 'TRANSFER_IN', detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
      description: 'Card payment received',
    })
    const ambiguous = await createCanonicalMovement({
      admin, customer: owner.customer, businessId: owner.businessId, accountId: checking, amountCents: -9_999,
      date: '2026-08-20', description: 'Amazon marketplace purchase',
    })

    for (let index = 0; index < 10; index += 1) {
      const result = await drainBookkeepingProcessingJobs({ batchSize: 25, admin })
      if (result.claimed === 0) break
    }
    const { data: decisions } = await admin.from('bookkeeping_decisions')
      .select('id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,provenance')
      .eq('business_id', owner.businessId)
    const superseded = new Set((decisions ?? []).map((decision) => decision.supersedes_decision_id).filter(Boolean))
    const current = (decisions ?? []).filter((decision) => !superseded.has(decision.id))
    for (const recordId of [transferOut, transferIn]) {
      expect(current).toContainEqual(expect.objectContaining({
        bookkeeping_record_id: recordId, bookkeeping_nature: 'transfer',
        treatment: 'excluded', provenance: 'automation',
      }))
    }
    for (const recordId of [cardOut, cardIn]) {
      expect(current).toContainEqual(expect.objectContaining({
        bookkeeping_record_id: recordId, bookkeeping_nature: 'credit_card_payment',
        treatment: 'excluded', provenance: 'automation',
      }))
    }
    expect(current).toContainEqual(expect.objectContaining({
      bookkeeping_record_id: ambiguous, bookkeeping_nature: null,
      treatment: 'unresolved', provenance: 'system',
    }))
    expect(current.some((decision) => decision.treatment === 'personal')).toBe(false)
    const { data: allocations } = await admin.from('bookkeeping_allocations')
      .select('bookkeeping_record_id,allocation_kind,amount_cents')
      .eq('business_id', owner.businessId)
    expect(allocations).toHaveLength(4)
    expect(allocations?.every((allocation) => allocation.allocation_kind === 'excluded')).toBe(true)
    const { count: questionCount } = await admin.from('bookkeeping_review_events')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    const { count: taxTreatmentCount } = await admin.from('bookkeeping_tax_treatments')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    expect({ questionCount, taxTreatmentCount }).toEqual({
      questionCount: 0, taxTreatmentCount: 0,
    })
    const report = await getAuthenticatedCanonicalReport({
      supabase: owner.customer, periodStart: '2026-01-01', periodEnd: '2026-12-31',
    })
    expect(report).toMatchObject({
      businessIncomeCents: 0, businessExpensesCents: 0, businessProfitCents: 0,
    })
    expect(report.completeness.unresolvedRecordCount).toBe(1)

    await admin.rpc('request_bookkeeping_processing', {
      p_business_id: owner.businessId,
      p_bookkeeping_record_id: transferOut,
      p_processing_reason: 'deterministic_evaluation',
      p_target_fingerprint: `bookkeeping-evaluator:v1:record:${transferOut}`,
    })
    await drainBookkeepingProcessingJobs({ batchSize: 25, admin })
    const { count: transferDecisionCount } = await admin.from('bookkeeping_decisions')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
      .eq('bookkeeping_record_id', transferOut)
    expect(transferDecisionCount).toBe(2)
  })
})
