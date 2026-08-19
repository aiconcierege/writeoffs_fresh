import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  ingestCsvFinancialActivity,
  prepareCsvFinancialRows,
  type PreparedCsvFinancialRow,
} from '../../app/lib/bookkeeping/csv-ingestion'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal =
  process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(url && anonKey && serviceKey)

const mapping = { date: 'date', description: 'description', amount: 'amount' }

function client(key = anonKey!) {
  return createClient(url!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function createUser(admin: SupabaseClient, label: string) {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const email = `csv-${label}-${nonce}@example.test`
  const password = `local-${nonce}-password`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('local user creation failed')
  const signed = client()
  const { error: signInError } = await signed.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id')
    .eq('owner_user_id', data.user.id)
    .single()
  if (businessError) throw businessError
  return { id: data.user.id, businessId: business.id, email, password, client: signed }
}

function row(
  description: string,
  amount = '-42.10',
  date = '2026-08-19'
): PreparedCsvFinancialRow {
  return prepareCsvFinancialRows({
    mapping,
    rows: [{ date, description, amount }],
  }).rows[0]
}

function rpcRow(value: PreparedCsvFinancialRow) {
  return {
    row_number: value.rowNumber,
    transaction_date: value.transactionDate,
    amount_cents: value.amountCents,
    currency: value.currency,
    raw_description: value.rawDescription,
    normalized_description: value.normalizedDescription,
    source_fingerprint: value.sourceFingerprint,
    legacy_dedupe_hash: value.legacyDedupeHash,
  }
}

describe.skipIf(!runLocal)('canonical CSV ingestion on local Supabase', () => {
  it('atomically creates account, immutable source, unresolved canonical state, and legacy compatibility', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'foundation')
    const source = row('Local Hardware')
    const result = await ingestCsvFinancialActivity({ supabase: owner.client, rows: [source] })
    expect(result).toEqual({ imported: 1, duplicates: 0, processed: 1 })

    const { data: accounts, error: accountError } = await owner.client
      .from('financial_accounts')
      .select('id,business_id,provider,provider_account_id,currency')
      .eq('business_id', owner.businessId)
    expect(accountError).toBeNull()
    expect(accounts).toHaveLength(1)
    expect(accounts?.[0]).toMatchObject({
      business_id: owner.businessId,
      provider: 'csv',
      currency: 'USD',
    })

    const { data: financial, error: financialError } = await owner.client
      .from('financial_transactions')
      .select('id,business_id,financial_account_id,amount_cents,currency,transaction_date,import_method')
      .eq('business_id', owner.businessId)
      .single()
    expect(financialError).toBeNull()
    expect(financial).toMatchObject({
      amount_cents: -4_210,
      currency: 'USD',
      transaction_date: '2026-08-19',
      import_method: 'csv',
    })

    const { data: record, error: recordError } = await owner.client
      .from('bookkeeping_records')
      .select('id,source_kind,amount_cents,currency,occurred_on')
      .eq('business_id', owner.businessId)
      .single()
    expect(recordError).toBeNull()
    expect(record).toMatchObject({
      source_kind: 'financial_transaction',
      amount_cents: -4_210,
      currency: 'USD',
      occurred_on: '2026-08-19',
    })
    const { data: decisions, error: decisionError } = await owner.client
      .from('bookkeeping_decisions')
      .select('id,bookkeeping_nature,treatment,review_status,provenance')
      .eq('bookkeeping_record_id', record!.id)
    expect(decisionError).toBeNull()
    expect(decisions).toEqual([expect.objectContaining({
      bookkeeping_nature: null,
      treatment: 'unresolved',
      review_status: 'needs_review',
      provenance: 'system',
    })])
    const { count: allocationCount, error: allocationError } = await owner.client
      .from('bookkeeping_allocations')
      .select('*', { count: 'exact', head: true })
      .eq('bookkeeping_decision_id', decisions![0].id)
    expect(allocationError).toBeNull()
    expect(allocationCount).toBe(0)

    const { data: legacy, error: legacyError } = await owner.client
      .from('transactions')
      .select('user_id,date,vendor,amount,amount_cents,source,source_account_id')
      .eq('user_id', owner.id)
      .single()
    expect(legacyError).toBeNull()
    expect(legacy).toMatchObject({
      user_id: owner.id,
      date: '2026-08-19',
      vendor: 'Local Hardware',
      amount_cents: -4_210,
      source: 'csv',
      source_account_id: 'csv',
    })

    const { error: updateError } = await owner.client
      .from('financial_transactions')
      .update({ amount_cents: -1 })
      .eq('id', financial!.id)
    expect(updateError).not.toBeNull()
  })

  it('converges retries, concurrent submissions, and overlapping imports', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'retry')
    const one = row('Overlap One', '-10.00', '2026-08-18')
    const two = row('Overlap Two', '-20.00', '2026-08-19')

    const concurrent = await Promise.all([
      ingestCsvFinancialActivity({ supabase: owner.client, rows: [one, two] }),
      ingestCsvFinancialActivity({ supabase: owner.client, rows: [one, two] }),
    ])
    expect(concurrent.reduce((total, result) => total + result.imported, 0)).toBe(2)
    expect(concurrent.reduce((total, result) => total + result.duplicates, 0)).toBe(2)

    const overlap = await ingestCsvFinancialActivity({
      supabase: owner.client,
      rows: [two, row('Overlap Three', '-30.00', '2026-08-20')],
    })
    expect(overlap).toEqual({ imported: 1, duplicates: 1, processed: 2 })

    for (const table of [
      'financial_accounts',
      'financial_transactions',
      'bookkeeping_records',
      'bookkeeping_decisions',
      'transactions',
    ]) {
      const column = table === 'transactions' ? 'user_id' : 'business_id'
      const value = table === 'transactions' ? owner.id : owner.businessId
      const { count, error } = await owner.client
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, value)
      expect(error, table).toBeNull()
      expect(count, table).toBe(table === 'financial_accounts' ? 1 : 3)
    }
  })

  it('rolls back every representation when any row fails database validation', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'rollback')
    const valid = row('Atomic First')
    const invalid = { ...rpcRow(row('Atomic Invalid')), source_fingerprint: 'tampered' }
    const { error } = await owner.client.rpc('ingest_csv_financial_activity', {
      p_rows: [rpcRow(valid), invalid],
    })
    expect(error).not.toBeNull()

    for (const table of ['financial_accounts', 'financial_transactions', 'bookkeeping_records']) {
      const { count, error: countError } = await owner.client
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('business_id', owner.businessId)
      expect(countError, table).toBeNull()
      expect(count, table).toBe(0)
    }
    const { count: legacyCount, error: legacyError } = await owner.client
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', owner.id)
    expect(legacyError).toBeNull()
    expect(legacyCount).toBe(0)
  })

  it('isolates identical fingerprints and canonical records by Business', async () => {
    const admin = client(serviceKey!)
    const a = await createUser(admin, 'tenant-a')
    const b = await createUser(admin, 'tenant-b')
    const same = row('Same Source Fact')
    await ingestCsvFinancialActivity({ supabase: a.client, rows: [same] })
    await ingestCsvFinancialActivity({ supabase: b.client, rows: [same] })

    const { data: bAccounts, error: bAccountError } = await b.client
      .from('financial_accounts')
      .select('id,business_id')
      .eq('business_id', b.businessId)
    expect(bAccountError).toBeNull()
    expect(bAccounts).toHaveLength(1)
    const bAccount = bAccounts![0]

    const { error: crossTenantInsert } = await a.client
      .from('financial_transactions')
      .insert({
        business_id: a.businessId,
        financial_account_id: bAccount.id,
        source_fingerprint: 'cross-tenant-attempt',
        import_method: 'csv',
        original_description: 'Cross tenant',
        amount_cents: -100,
        currency: 'USD',
        transaction_date: '2026-08-19',
      })
    expect(crossTenantInsert).not.toBeNull()

    const { data: visibleB } = await a.client
      .from('financial_transactions')
      .select('id')
      .eq('business_id', b.businessId)
    expect(visibleB).toEqual([])
  })

  it('denies anonymous execution and rejects caller-tampered identities', async () => {
    const admin = client(serviceKey!)
    const owner = await createUser(admin, 'security')
    const source = row('Secure Source')
    const { error: anonymousError } = await client().rpc('ingest_csv_financial_activity', {
      p_rows: [rpcRow(source)],
    })
    expect(anonymousError).not.toBeNull()

    const { error: tamperedError } = await owner.client.rpc('ingest_csv_financial_activity', {
      p_rows: [{ ...rpcRow(source), legacy_dedupe_hash: 'caller-controlled' }],
    })
    expect(tamperedError).not.toBeNull()
  })
})
