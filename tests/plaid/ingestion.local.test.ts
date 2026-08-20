import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createLocalReceipt, provisionLocalCanonicalOwner } from '../helpers/local-canonical'
import type { PlaidGateway, PlaidSyncPage } from '../../app/lib/plaid/types'
import {
  disconnectPlaidItem, exchangePlaidPublicToken, syncPlaidItem,
} from '../../app/lib/plaid/service'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { recordPlaidWebhook } from '../../app/lib/plaid/webhooks'
import { getAuthenticatedCanonicalReport } from '../../app/lib/bookkeeping/reporting-service'
import { attachReceiptToFinancialTransaction } from '../../app/lib/bookkeeping/receipt-matching-workflow'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe : describe.skip

class FakePlaid implements PlaidGateway {
  pages: PlaidSyncPage[]
  itemId = `item-${crypto.randomUUID()}`
  exchanges = 0
  removed = 0
  accountNamespace: string
  constructor(pages: PlaidSyncPage[], accountNamespace = 'owner-one') {
    this.pages = [...pages]; this.accountNamespace = accountNamespace
  }
  async createLinkToken() { return { link_token: 'link-sandbox', expiration: new Date().toISOString() } }
  async exchangePublicToken() { this.exchanges += 1; return { access_token: 'access-sandbox-secret', item_id: this.itemId } }
  async getAccounts() { return { accounts: [
    { account_id: `${this.accountNamespace}-checking-1`, type: 'depository', subtype: 'checking', name: 'Business Checking',
      official_name: 'Business Checking', mask: '1234', balances: { iso_currency_code: 'USD' } },
    { account_id: `${this.accountNamespace}-credit-1`, type: 'credit', subtype: 'credit card', name: 'Business Card',
      mask: '9876', balances: { iso_currency_code: 'USD' } },
  ] } }
  async syncTransactions() {
    const page = this.pages.shift()
    if (!page) return { added: [], modified: [], removed: [], next_cursor: 'steady', has_more: false }
    return page
  }
  async removeItem() { this.removed += 1 }
  async getWebhookVerificationKey() { return {} }
}

function tx(input: { id: string; account?: string; amount?: number; pending?: boolean; pendingId?: string }, namespace = 'owner-one') {
  return {
    transaction_id: input.id, account_id: input.account ?? `${namespace}-checking-1`, date: '2026-08-10',
    authorized_date: '2026-08-09', amount: input.amount ?? 25, name: `Source ${input.id}`,
    merchant_name: `Merchant ${input.id}`, pending: input.pending ?? false,
    pending_transaction_id: input.pendingId ?? null, payment_channel: 'online', iso_currency_code: 'USD',
  }
}

suite('Plaid ingestion against local PostgreSQL', () => {
  it('exchanges once, encrypts credentials, maps accounts, and applies current source history atomically', async () => {
    process.env.SUPABASE_URL = url
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
    process.env.PLAID_ENV = 'sandbox'
    process.env.PLAID_SANDBOX_LINK_ENABLED = 'true'
    process.env.PLAID_CLIENT_ID = 'sandbox-client'
    process.env.PLAID_SECRET = 'sandbox-secret'
    process.env.PLAID_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'plaid-owner', amounts: [] })
    const other = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'plaid-other', amounts: [] })
    const namespace = `owner-${crypto.randomUUID()}`
    const initialGateway = new FakePlaid([
      { added: [tx({ id: 'pending-1', pending: true }, namespace), tx({ id: 'tx-1' }, namespace)], modified: [], removed: [], next_cursor: 'page-1', has_more: true },
      { added: [tx({ id: 'tx-remove', account: `${namespace}-credit-1`, amount: 10 }, namespace)], modified: [], removed: [], next_cursor: 'cursor-1', has_more: false },
    ], namespace)
    const requestId = crypto.randomUUID()
    const exchanged = await exchangePlaidPublicToken({
      supabase: owner.customer, publicToken: 'public-sandbox-once', requestId,
      institution: { id: 'ins-test', name: 'Sandbox Bank' }, gateway: initialGateway,
    })
    expect(exchanged.replayed).toBe(false)
    const itemId = exchanged.itemId as string
    const replay = await exchangePlaidPublicToken({
      supabase: owner.customer, publicToken: 'public-sandbox-once', requestId,
      gateway: initialGateway,
    })
    expect(replay).toMatchObject({ itemId, replayed: true })
    expect(initialGateway.exchanges).toBe(1)

    const { data: storedItem } = await admin.from('plaid_items')
      .select('access_token_ciphertext,sync_cursor,connection_status').eq('id', itemId).single()
    expect(storedItem?.access_token_ciphertext).not.toContain('access-sandbox-secret')
    expect(storedItem).toMatchObject({ sync_cursor: 'cursor-1', connection_status: 'updating' })
    const customerItems = await owner.customer.from('plaid_items').select('*')
    expect(customerItems.error).not.toBeNull()
    const { data: ownConnections } = await owner.customer.rpc('list_plaid_connections')
    const { data: otherConnections } = await other.customer.rpc('list_plaid_connections')
    expect(ownConnections).toHaveLength(1)
    expect(otherConnections).toEqual([])
    await expect(disconnectPlaidItem({
      supabase: other.customer, itemRecordId: itemId, gateway: initialGateway,
    })).rejects.toThrow('ITEM_NOT_FOUND')
    const forgedAccount = await owner.customer.from('financial_accounts').insert({
      business_id: owner.businessId, provider: 'plaid', provider_account_id: 'forged',
      institution_name: 'Forged', display_name: 'Forged', account_type: 'checking',
    })
    expect(forgedAccount.error).not.toBeNull()

    const { data: accounts } = await owner.customer.from('financial_accounts')
      .select('display_name,account_type,mask_last_four').eq('provider', 'plaid')
    expect(accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ display_name: 'Business Checking', account_type: 'checking' }),
      expect.objectContaining({ display_name: 'Business Card', account_type: 'credit_card' }),
    ]))
    const { data: initialCanonical } = await owner.customer.from('financial_transactions')
      .select('id,amount_cents,pending').eq('business_id', owner.businessId)
    expect(initialCanonical).toHaveLength(2)
    expect(initialCanonical?.map((row) => Number(row.amount_cents))).toEqual(expect.arrayContaining([-2500, -1000]))
    expect(initialCanonical?.every((row) => row.pending === false)).toBe(true)

    const readinessBody = JSON.stringify({
      webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: initialGateway.itemId, environment: 'sandbox',
      initial_update_complete: true, historical_update_complete: true,
    })
    const readinessDelivery = `signed-delivery-readiness-${crypto.randomUUID()}`
    expect(await recordPlaidWebhook(readinessBody, readinessDelivery))
      .toMatchObject({ duplicate: false, itemId, shouldSync: true })
    expect(await recordPlaidWebhook(readinessBody, readinessDelivery))
      .toMatchObject({ duplicate: true, shouldSync: false })

    const updateGateway = new FakePlaid([{
      added: [tx({ id: 'posted-1', amount: 26, pendingId: 'pending-1' }, namespace)],
      modified: [tx({ id: 'tx-1', amount: 30 }, namespace)],
      removed: [{ transaction_id: 'pending-1' }, { transaction_id: 'tx-remove' }],
      next_cursor: 'cursor-2', has_more: false,
    }], namespace)
    await syncPlaidItem(itemId, updateGateway)
    const { data: versions } = await owner.customer.from('plaid_transaction_versions')
      .select('id,plaid_transaction_id,event_type,supersedes_version_id,canonical_financial_transaction_id')
      .eq('business_id', owner.businessId)
    expect(versions).toHaveLength(7)
    expect(versions?.filter((row) => row.plaid_transaction_id === 'tx-1')).toHaveLength(2)
    expect(versions).toContainEqual(expect.objectContaining({ plaid_transaction_id: 'pending-1', event_type: 'removed' }))
    const visible = await listTransactionReadModel({ supabase: owner.customer, userId: owner.userId })
    expect(visible).toHaveLength(2)
    expect(visible.map((row) => row.amountCents)).toEqual(expect.arrayContaining([-3000, -2600]))
    const report = await getAuthenticatedCanonicalReport({
      supabase: owner.customer, periodStart: '2026-01-01', periodEnd: '2026-12-31',
    })
    expect(report.rows.filter((row) => row.sourceModel === 'canonical')).toHaveLength(2)
    const receiptId = await createLocalReceipt({ userId: owner.userId })
    await attachReceiptToFinancialTransaction({
      supabase: owner.customer, financialTransactionId: visible[0].id, receiptId,
    })
    const { data: receiptLinks } = await owner.customer.from('bookkeeping_document_links')
      .select('receipt_id').eq('receipt_id', receiptId).is('revoked_at', null)
    expect(receiptLinks).toHaveLength(1)
    const staleFinancialId = versions?.map((row) => row.canonical_financial_transaction_id)
      .find((id) => id && !visible.some((row) => row.id === id)) as string
    await expect(attachReceiptToFinancialTransaction({
      supabase: owner.customer, financialTransactionId: staleFinancialId,
      receiptId: await createLocalReceipt({ userId: owner.userId }),
    })).rejects.toThrow()

    const repeated = new FakePlaid([{
      added: [tx({ id: 'posted-1', amount: 26, pendingId: 'pending-1' }, namespace)], modified: [], removed: [],
      next_cursor: 'cursor-2', has_more: false,
    }], namespace)
    await syncPlaidItem(itemId, repeated)
    const { count: recordCount } = await admin.from('bookkeeping_records')
      .select('*', { count: 'exact', head: true }).eq('business_id', owner.businessId)
    expect(recordCount).toBe(4)

    const disconnectGateway = new FakePlaid([], namespace)
    await disconnectPlaidItem({ supabase: owner.customer, itemRecordId: itemId, gateway: disconnectGateway })
    expect(disconnectGateway.removed).toBe(1)
    await recordPlaidWebhook(JSON.stringify({
      webhook_type: 'ITEM', webhook_code: 'USER_PERMISSION_REVOKED',
      item_id: initialGateway.itemId, environment: 'sandbox',
    }), 'signed-delivery-revoked-after-disconnect')
    const { data: stillDisconnected } = await admin.from('plaid_items')
      .select('connection_status,consent_status').eq('id', itemId).single()
    expect(stillDisconnected).toEqual({ connection_status: 'disconnected', consent_status: 'disconnected' })
    const { data: afterDisconnect } = await admin.from('plaid_items').select('connection_status,consent_status')
      .eq('id', itemId).single()
    expect(afterDisconnect).toEqual({ connection_status: 'disconnected', consent_status: 'disconnected' })
    expect(await disconnectPlaidItem({ supabase: owner.customer, itemRecordId: itemId, gateway: disconnectGateway }))
      .toEqual({ disconnected: true })
    expect(disconnectGateway.removed).toBe(1)
  })

  it('serializes concurrent sync and does not advance the cursor when a later page fails', async () => {
    process.env.SUPABASE_URL = url
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
    process.env.PLAID_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    const owner = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'plaid-concurrency', amounts: [] })
    const namespace = `owner-${crypto.randomUUID()}`
    const gateway = new FakePlaid([{ added: [], modified: [], removed: [], next_cursor: 'base', has_more: false }], namespace)
    const result = await exchangePlaidPublicToken({
      supabase: owner.customer, publicToken: `public-${crypto.randomUUID()}`,
      requestId: crypto.randomUUID(), gateway,
    })
    const itemId = result.itemId as string
    const slow = new FakePlaid([{ added: [], modified: [], removed: [], next_cursor: 'next', has_more: false }], namespace)
    const [one, two] = await Promise.all([syncPlaidItem(itemId, slow), syncPlaidItem(itemId, slow)])
    expect([one, two].filter((value) => value.busy)).toHaveLength(1)

    let calls = 0
    const failing = new FakePlaid([], namespace)
    failing.syncTransactions = async () => {
      calls += 1
      if (calls === 1) return { added: [], modified: [], removed: [], next_cursor: 'not-committed', has_more: true }
      throw { response: { data: { error_code: 'INSTITUTION_DOWN', error_type: 'INSTITUTION_ERROR' } } }
    }
    await expect(syncPlaidItem(itemId, failing)).rejects.toBeTruthy()
    const { data: unchanged } = await admin.from('plaid_items').select('sync_cursor,connection_status')
      .eq('id', itemId).single()
    expect(unchanged).toEqual({ sync_cursor: 'next', connection_status: 'needs_attention' })

    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const began = new Promise<void>((resolve) => { started = resolve })
    const disconnectingSync = new FakePlaid([], namespace)
    disconnectingSync.syncTransactions = async () => {
      started(); await gate
      return { added: [], modified: [], removed: [], next_cursor: 'must-not-commit', has_more: false }
    }
    const activeSync = syncPlaidItem(itemId, disconnectingSync)
    await began
    const remover = new FakePlaid([], namespace)
    await disconnectPlaidItem({ supabase: owner.customer, itemRecordId: itemId, gateway: remover })
    release()
    await expect(activeSync).rejects.toThrow(/lease or cursor is stale/i)
    const { data: disconnected } = await admin.from('plaid_items').select('sync_cursor,connection_status')
      .eq('id', itemId).single()
    expect(disconnected).toEqual({ sync_cursor: 'next', connection_status: 'disconnected' })
  })
})
