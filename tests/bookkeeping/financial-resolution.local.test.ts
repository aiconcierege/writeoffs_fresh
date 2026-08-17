import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'

const localUrl = process.env.LOCAL_SUPABASE_URL
const localAnonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const runLocal =
  process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && localAnonKey)

const userA = { email: 'canonical-a@example.test', password: 'local-password-a' }
const userB = { email: 'canonical-b@example.test', password: 'local-password-b' }
const transactionA = '43000000-0000-0000-0000-000000000001'
const preMatchedTransactionA = '43000000-0000-0000-0000-000000000002'
const otherBusinessTransaction = '43000000-0000-0000-0000-000000000003'
const preMatchedRecord = '63000000-0000-0000-0000-000000000002'

function client() {
  return createClient(localUrl!, localAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signIn(credentials: typeof userA) {
  const supabase = client()
  const { data, error } = await supabase.auth.signInWithPassword(credentials)
  if (error || !data.user) throw error ?? new Error('local sign-in failed')
  return supabase
}

describe.skipIf(!runLocal)('canonical financial resolution on local Supabase', () => {
  it('requires an authenticated Supabase session', async () => {
    await expect(
      resolveFinancialTransactionRecord({
        supabase: client(),
        financialTransactionId: transactionA,
      })
    ).rejects.toThrow('authenticated user')
  })

  it('converges on one database-owned record and preserves a later resolved decision', async () => {
    const supabase = await signIn(userA)
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        resolveFinancialTransactionRecord({
          supabase,
          financialTransactionId: transactionA,
        })
      )
    )

    expect(new Set(results.map(({ record }) => record.id))).toHaveLength(1)
    expect(new Set(results.map(({ decision }) => decision.id))).toHaveLength(1)
    expect(results[0].record).toMatchObject({
      authoritativeAmountCents: -12_345,
      authoritativeCurrency: 'USD',
    })
    expect(results[0].decision).toMatchObject({
      bookkeepingNature: null,
      treatment: 'unresolved',
      reviewStatus: 'needs_review',
      allocations: [],
    })

    const { data: sourceRows, error: sourceError } = await supabase
      .from('bookkeeping_financial_sources')
      .select('bookkeeping_record_id')
      .eq('financial_transaction_id', transactionA)
      .is('revoked_at', null)
    expect(sourceError).toBeNull()
    expect(sourceRows).toHaveLength(1)

    const { data: record, error: recordError } = await supabase
      .from('bookkeeping_records')
      .select('source_kind,ingestion_key,amount_cents,currency,occurred_on')
      .eq('id', results[0].record.id)
      .single()
    expect(recordError).toBeNull()
    expect(record).toEqual({
      source_kind: 'financial_transaction',
      ingestion_key: `financial_transaction:${transactionA}`,
      amount_cents: -12_345,
      currency: 'USD',
      occurred_on: '2026-08-01',
    })

    const { error: correctionError } = await supabase.rpc(
      'append_bookkeeping_decision',
      {
        p_business_id: results[0].record.businessId,
        p_bookkeeping_record_id: results[0].record.id,
        p_expected_current_decision_id: results[0].decision.id,
        p_bookkeeping_nature: 'expense',
        p_treatment: 'business',
        p_review_status: 'resolved',
        p_provenance: 'user',
        p_confidence: null,
        p_reason: 'Local integration correction',
        p_business_purpose: null,
        p_allocations: [{ kind: 'business', amount_cents: -12_345 }],
      }
    )
    expect(correctionError).toBeNull()

    const repeated = await resolveFinancialTransactionRecord({
      supabase,
      financialTransactionId: transactionA,
    })
    expect(repeated.record.id).toBe(results[0].record.id)
    expect(repeated.decision).toMatchObject({
      bookkeepingNature: 'expense',
      treatment: 'business',
      reviewStatus: 'resolved',
    })
  })

  it('reuses a record previously created through another canonical path', async () => {
    const supabase = await signIn(userA)
    const resolved = await resolveFinancialTransactionRecord({
      supabase,
      financialTransactionId: preMatchedTransactionA,
    })

    expect(resolved.record.id).toBe(preMatchedRecord)
    expect(resolved.record.authoritativeAmountCents).toBe(-5_000)
    expect(resolved.decision.treatment).toBe('unresolved')
  })

  it('cannot resolve another Business financial transaction', async () => {
    const supabase = await signIn(userB)
    await expect(
      resolveFinancialTransactionRecord({
        supabase,
        financialTransactionId: transactionA,
      })
    ).rejects.toThrow('not found for this Business')
    await expect(
      resolveFinancialTransactionRecord({
        supabase: await signIn(userA),
        financialTransactionId: otherBusinessTransaction,
      })
    ).rejects.toThrow('not found for this Business')
  })
})
