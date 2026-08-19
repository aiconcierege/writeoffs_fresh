import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { attachReceiptToFinancialTransaction } from '../../app/lib/bookkeeping/receipt-matching-workflow'
import { resolveFinancialTransactionRecord } from '../../app/lib/bookkeeping/financial-transaction-workflow'
import { createLocalReceipt, provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const localUrl = process.env.LOCAL_SUPABASE_URL
const localAnonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const runLocal =
  process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && localAnonKey && process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY)

const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
let ownerClient: ReturnType<typeof client>
let transactionA: string
let preMatchedTransaction: string
let preMatchedRecord: string
let receiptA: string
let receiptB: string

function client() {
  return createClient(localUrl!, localAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe.skipIf(!runLocal)('canonical receipt matching on local Supabase', () => {
  beforeAll(async () => {
    const admin = createClient(localUrl!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: localUrl!,
      anonKey: localAnonKey!, label: 'receipt-owner', amounts: [-4_500, -5_000] })
    const other = await provisionLocalCanonicalOwner({ admin, url: localUrl!,
      anonKey: localAnonKey!, label: 'receipt-other', amounts: [-1_000] })
    ownerClient = owner.customer as ReturnType<typeof client>
    ;[transactionA, preMatchedTransaction] = owner.transactionIds
    receiptA = await createLocalReceipt({ userId: owner.userId })
    receiptB = await createLocalReceipt({ userId: other.userId })
    preMatchedRecord = (await resolveFinancialTransactionRecord({
      supabase: ownerClient, financialTransactionId: preMatchedTransaction,
    })).record.id
  })

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
    const supabase = ownerClient
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
        supabase: ownerClient,
        financialTransactionId: transactionA,
        receiptId: receiptB,
      })
    ).rejects.toThrow('Receipt was not found for this Business')
  })

  it('reuses an existing canonical record when attaching documentation', async () => {
    const matched = await attachReceiptToFinancialTransaction({
      supabase: ownerClient,
      financialTransactionId: preMatchedTransaction,
      receiptId: receiptA,
    })
    expect(matched.record.id).toBe(preMatchedRecord)
  })

  it('retains revoked link history and database evidence protection', async () => {
    const supabase = ownerClient
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
