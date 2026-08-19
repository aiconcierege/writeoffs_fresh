import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import {
  ingestCsvFinancialActivity,
  prepareCsvFinancialRows,
} from '../../app/lib/bookkeeping/csv-ingestion'

export async function provisionLocalCanonicalOwner(input: {
  admin: SupabaseClient
  url: string
  anonKey: string
  label: string
  amounts: number[]
  occurredYear?: number
}) {
  const nonce = crypto.randomUUID()
  const email = `${input.label}-${nonce}@example.test`
  const password = `local-${nonce}-password`
  const { data, error } = await input.admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('local user creation failed')
  const customer = createClient(input.url, input.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await customer.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const { data: business, error: businessError } = await input.admin.from('businesses')
    .select('id').eq('owner_user_id', data.user.id).single()
  if (businessError) throw businessError

  const prepared = prepareCsvFinancialRows({
    mapping: { date: 'date', description: 'description', amount: 'amount' },
    rows: input.amounts.map((amount, index) => ({
      date: `${input.occurredYear ?? 2026}-08-${String(index + 1).padStart(2, '0')}`,
      description: `${input.label} source ${index + 1} ${nonce}`,
      amount: (amount / 100).toFixed(2),
    })),
  }).rows
  await ingestCsvFinancialActivity({ supabase: customer, rows: prepared })
  const { data: transactions, error: transactionError } = await customer
    .from('financial_transactions').select('id,amount_cents')
    .eq('business_id', business.id).order('transaction_date')
  if (transactionError) throw transactionError
  return {
    customer,
    userId: data.user.id,
    businessId: business.id as string,
    transactionIds: transactions.map((row) => row.id as string),
  }
}

export async function createLocalReceipt(input: {
  userId: string
}) {
  const id = crypto.randomUUID()
  execFileSync('docker', ['exec', 'supabase_db_writeoffs_fresh', 'psql',
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    `insert into public.receipts (id,user_id,storage_path,mime_type,bytes,original_name)
     values ('${id}','${input.userId}','local-tests/${id}.pdf','application/pdf',100,'${id}.pdf')`],
  { stdio: 'pipe' })
  return id
}

export function createLocalLegacyTransaction(userId: string) {
  const id = crypto.randomUUID()
  execFileSync('docker', ['exec', 'supabase_db_writeoffs_fresh', 'psql',
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    `insert into public.transactions (id,user_id,date,vendor,amount,amount_cents,currency,source,dedupe_hash)
     values ('${id}','${userId}','2025-01-02','Historical Vendor',-12.34,-1234,'USD','legacy','${crypto.randomUUID()}')`],
  { stdio: 'pipe' })
  return id
}
