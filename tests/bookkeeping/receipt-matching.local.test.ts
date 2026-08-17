import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { attachReceiptToFinancialTransaction } from '../../app/lib/bookkeeping/receipt-matching-workflow'

const localUrl = process.env.LOCAL_SUPABASE_URL
const localAnonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const runLocal =
  process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && localAnonKey)

const userA = { email: 'canonical-a@example.test', password: 'local-password-a' }
const transactionA = '43000000-0000-0000-0000-000000000004'
const preMatchedTransaction = '43000000-0000-0000-0000-000000000002'
const preMatchedRecord = '63000000-0000-0000-0000-000000000002'
const receiptA = '53000000-0000-0000-0000-000000000001'
const receiptB = '53000000-0000-0000-0000-000000000002'

function client() {
  return createClient(localUrl!, localAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signIn() {
  const supabase = client()
  const { error } = await supabase.auth.signInWithPassword(userA)
  if (error) throw error
  return supabase
}

describe.skipIf(!runLocal)('canonical receipt matching on local Supabase', () => {
  it('rejects unauthenticated matching', async () => {
    await expect(
      attachReceiptToFinancialTransaction({
        supabase: client(),
        financialTransactionId: transactionA,
        receiptId: receiptA,
      })
    ).rejects.toThrow('authenticated user')
  })

  it('links same-Business evidence idempotently without legacy or decision writes', async () => {
    const supabase = await signIn()
    const first = await attachReceiptToFinancialTransaction({
      supabase,
      financialTransactionId: transactionA,
      receiptId: receiptA,
    })
    const { count: decisionsBefore } = await supabase
      .from('bookkeeping_decisions')
      .select('*', { count: 'exact', head: true })
      .eq('bookkeeping_record_id', first.record.id)
    const second = await attachReceiptToFinancialTransaction({
      supabase,
      financialTransactionId: transactionA,
      receiptId: receiptA,
    })

    expect(second.record.id).toBe(first.record.id)
    expect(second.link.id).toBe(first.link.id)
    expect(second.decision.id).toBe(first.decision.id)
    expect(second.decision).toMatchObject({
      bookkeepingNature: null,
      treatment: 'unresolved',
      reviewStatus: 'needs_review',
      allocations: [],
    })
    const { count: links } = await supabase
      .from('bookkeeping_document_links')
      .select('*', { count: 'exact', head: true })
      .eq('bookkeeping_record_id', first.record.id)
      .eq('receipt_id', receiptA)
      .is('revoked_at', null)
    expect(links).toBe(1)
    const { count: decisionsAfter } = await supabase
      .from('bookkeeping_decisions')
      .select('*', { count: 'exact', head: true })
      .eq('bookkeeping_record_id', first.record.id)
    expect(decisionsAfter).toBe(decisionsBefore)
    const { data: receipt } = await supabase
      .from('receipts')
      .select('transaction_id')
      .eq('id', receiptA)
      .single()
    expect(receipt?.transaction_id).toBeNull()
  })

  it('rejects a receipt owned by another Business', async () => {
    await expect(
      attachReceiptToFinancialTransaction({
        supabase: await signIn(),
        financialTransactionId: transactionA,
        receiptId: receiptB,
      })
    ).rejects.toThrow('Receipt was not found for this Business')
  })

  it('reuses an existing canonical record when attaching documentation', async () => {
    const matched = await attachReceiptToFinancialTransaction({
      supabase: await signIn(),
      financialTransactionId: preMatchedTransaction,
      receiptId: receiptA,
    })
    expect(matched.record.id).toBe(preMatchedRecord)
  })

  it('retains revoked link history and database evidence protection', async () => {
    const supabase = await signIn()
    const matched = await attachReceiptToFinancialTransaction({
      supabase,
      financialTransactionId: transactionA,
      receiptId: receiptA,
    })
    const { error: revokeError } = await supabase.rpc(
      'revoke_bookkeeping_receipt_with_documentation',
      {
        p_document_link_id: matched.link.id,
        p_reason: 'Local evidence-retention test',
      }
    )
    expect(revokeError).toBeNull()

    const { error: deleteError } = await supabase
      .from('receipts')
      .delete()
      .eq('id', receiptA)
    expect(deleteError).not.toBeNull()
    const { count: receiptsRemaining } = await supabase
      .from('receipts')
      .select('*', { count: 'exact', head: true })
      .eq('id', receiptA)
    expect(receiptsRemaining).toBe(1)
    const { count } = await supabase
      .from('bookkeeping_document_links')
      .select('*', { count: 'exact', head: true })
      .eq('id', matched.link.id)
    expect(count).toBe(1)
  })
})
