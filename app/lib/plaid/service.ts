import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { createPlaidGateway, newItemLinkRequest, updateModeLinkRequest } from './client'
import { requirePlaidConfig, requirePlaidSandboxLink } from './config'
import { decryptPlaidAccessToken, encryptPlaidAccessToken } from './token-crypto'
import { normalizePlaidAccount, normalizePlaidRemoval, normalizePlaidTransaction } from './normalize'
import type { PlaidGateway, PlaidTransactionEvent } from './types'

type Row = Record<string, unknown>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safePlaidError(error: unknown) {
  const row = error && typeof error === 'object' ? error as Row : {}
  const response = row.response && typeof row.response === 'object' ? row.response as Row : {}
  const data = response.data && typeof response.data === 'object' ? response.data as Row : {}
  return {
    code: typeof data.error_code === 'string' ? data.error_code : 'PLAID_REQUEST_FAILED',
    type: typeof data.error_type === 'string' ? data.error_type : 'API_ERROR',
  }
}

export async function requireBusiness(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('AUTHENTICATION_REQUIRED')
  const { data: business, error: businessError } = await supabase.from('businesses')
    .select('id').eq('owner_user_id', user.id).single()
  if (businessError || !business) throw new Error('BUSINESS_NOT_FOUND')
  return { userId: user.id, businessId: business.id as string }
}

function stablePlaidUserId(userId: string, businessId: string) {
  return createHash('sha256').update(`writeoffs-plaid:v1:${userId}:${businessId}`).digest('hex')
}

export async function createPlaidLinkToken(input: {
  supabase: SupabaseClient
  itemRecordId?: string | null
  gateway?: PlaidGateway
}) {
  const owner = await requireBusiness(input.supabase)
  requirePlaidSandboxLink()
  const config = requirePlaidConfig()
  const gateway = input.gateway ?? createPlaidGateway()
  const clientUserId = stablePlaidUserId(owner.userId, owner.businessId)
  if (!input.itemRecordId) {
    return gateway.createLinkToken(newItemLinkRequest({
      clientUserId, webhook: config.webhook, redirectUri: config.redirectUri,
    }) as unknown as Record<string, unknown>)
  }
  if (!UUID.test(input.itemRecordId)) throw new Error('INVALID_ITEM')
  const admin = createServerAdminSupabase()
  const { data: item, error: itemReadError } = await admin.from('plaid_items')
    .select('id,business_id,plaid_item_id,access_token_ciphertext,connection_status,consent_status')
    .eq('id', input.itemRecordId).eq('business_id', owner.businessId).maybeSingle()
  if (itemReadError || !item || item.connection_status === 'disconnected') throw new Error('ITEM_NOT_FOUND')
  return gateway.createLinkToken(updateModeLinkRequest({
    clientUserId,
    accessToken: decryptPlaidAccessToken(item.access_token_ciphertext),
    webhook: config.webhook,
    redirectUri: config.redirectUri,
  }) as unknown as Record<string, unknown>)
}

export async function exchangePlaidPublicToken(input: {
  supabase: SupabaseClient
  publicToken: string
  requestId: string
  institution?: { id?: string | null; name?: string | null } | null
  gateway?: PlaidGateway
}) {
  if (!UUID.test(input.requestId) || !input.publicToken || input.publicToken.length > 4096) {
    throw new Error('INVALID_EXCHANGE_REQUEST')
  }
  const owner = await requireBusiness(input.supabase)
  requirePlaidSandboxLink()
  const admin = createServerAdminSupabase()
  const tokenHash = createHash('sha256').update(input.publicToken).digest('hex')
  const { error: claimError } = await admin.from('plaid_exchange_requests').insert({
    id: input.requestId, business_id: owner.businessId, public_token_hash: tokenHash,
  })
  if (claimError) {
    const { data: prior } = await admin.from('plaid_exchange_requests')
      .select('status,plaid_item_record_id').eq('business_id', owner.businessId)
      .eq('public_token_hash', tokenHash).maybeSingle()
    if (prior?.status === 'completed') return { itemId: prior.plaid_item_record_id, replayed: true }
    throw new Error('EXCHANGE_ALREADY_IN_PROGRESS')
  }

  const gateway = input.gateway ?? createPlaidGateway()
  try {
    const exchanged = await gateway.exchangePublicToken(input.publicToken)
    const config = requirePlaidConfig()
    const { data: conflicting } = await admin.from('plaid_items').select('id,business_id')
      .eq('environment', config.environment).eq('plaid_item_id', exchanged.item_id).maybeSingle()
    if (conflicting && conflicting.business_id !== owner.businessId) throw new Error('ITEM_OWNERSHIP_CONFLICT')
    const encrypted = encryptPlaidAccessToken(exchanged.access_token)
    const institutionId = input.institution?.id?.slice(0, 128) || null
    const institutionName = input.institution?.name?.slice(0, 200) || null
    const { data: item, error: itemError } = conflicting
      ? await admin.from('plaid_items').update({
        access_token_ciphertext: encrypted, connection_status: 'updating', consent_status: 'active',
        disconnected_at: null,
      }).eq('id', conflicting.id).eq('business_id', owner.businessId).select('id').single()
      : await admin.from('plaid_items').insert({
        business_id: owner.businessId, plaid_item_id: exchanged.item_id,
        access_token_ciphertext: encrypted, environment: config.environment,
        institution_id: institutionId, institution_name: institutionName,
      }).select('id').single()
    if (itemError || !item) throw new Error('ITEM_STORAGE_FAILED')
    const { error: completedError } = await admin.from('plaid_exchange_requests').update({
      status: 'completed', plaid_item_record_id: item.id, completed_at: new Date().toISOString(),
    }).eq('id', input.requestId).eq('business_id', owner.businessId)
    if (completedError) throw new Error('EXCHANGE_STATE_FAILED')
    let sync: Row
    try {
      sync = await syncPlaidItem(item.id, gateway) as Row
    } catch {
      // Token exchange and tenant mapping are already durable. A later manual or
      // webhook sync can resume without asking the customer to link again.
      sync = { pending: true }
    }
    return { itemId: item.id, replayed: false, sync }
  } catch (error) {
    const detail = safePlaidError(error)
    await admin.from('plaid_exchange_requests').update({ status: 'failed', failure_code: detail.code })
      .eq('id', input.requestId).eq('business_id', owner.businessId)
    throw error
  }
}

async function fetchCompleteSync(input: {
  gateway: PlaidGateway
  accessToken: string
  startingCursor?: string
}) {
  for (let restart = 0; restart < 3; restart += 1) {
    let cursor = input.startingCursor
    const events: PlaidTransactionEvent[] = []
    try {
      for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
        const page = await input.gateway.syncTransactions(input.accessToken, cursor)
        events.push(
          ...page.added.map((value) => normalizePlaidTransaction(value, 'added')),
          ...page.modified.map((value) => normalizePlaidTransaction(value, 'modified')),
          ...page.removed.map(normalizePlaidRemoval),
        )
        cursor = page.next_cursor
        if (!page.has_more) return { cursor, events }
      }
      throw new Error('PLAID_SYNC_PAGE_LIMIT')
    } catch (error) {
      if (safePlaidError(error).code !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || restart === 2) throw error
    }
  }
  throw new Error('PLAID_SYNC_RESTART_FAILED')
}

export async function syncPlaidItem(itemRecordId: string, suppliedGateway?: PlaidGateway) {
  if (!UUID.test(itemRecordId)) throw new Error('INVALID_ITEM')
  const admin = createServerAdminSupabase()
  const leaseId = randomUUID()
  const { data: claims, error: claimError } = await admin.rpc('claim_plaid_item_sync', {
    p_item_record_id: itemRecordId, p_lease_id: leaseId,
  })
  if (claimError) throw new Error(`PLAID_SYNC_CLAIM_FAILED:${claimError.message}`)
  const claim = Array.isArray(claims) ? claims[0] as Row | undefined : claims as Row | null
  if (!claim) return { busy: true }
  const gateway = suppliedGateway ?? createPlaidGateway()
  try {
    const accessToken = decryptPlaidAccessToken(String(claim.access_token_ciphertext))
    const [accountsResponse, sync] = await Promise.all([
      gateway.getAccounts(accessToken),
      fetchCompleteSync({ gateway, accessToken, startingCursor: claim.sync_cursor as string | undefined }),
    ])
    const accounts = accountsResponse.accounts.map(normalizePlaidAccount).filter((value) => value !== null)
    if (!accounts.length) throw new Error('NO_SUPPORTED_ACCOUNTS')
    const { data, error } = await admin.rpc('apply_plaid_transaction_sync', {
      p_item_record_id: itemRecordId,
      p_lease_id: leaseId,
      p_expected_cursor: claim.sync_cursor ?? null,
      p_next_cursor: sync.cursor,
      p_accounts: accounts,
      p_events: sync.events,
    })
    if (error) throw new Error(`PLAID_SYNC_APPLY_FAILED:${error.message}`)
    return { busy: false, ...(data as Row) }
  } catch (error) {
    const detail = safePlaidError(error)
    await admin.rpc('fail_plaid_item_sync', {
      p_item_record_id: itemRecordId, p_lease_id: leaseId,
      p_error_code: detail.code, p_error_type: detail.type,
      p_reconnect_required: detail.code === 'ITEM_LOGIN_REQUIRED' || detail.code === 'ACCESS_NOT_GRANTED',
    })
    throw error
  }
}

export async function syncPlaidItemsForCustomer(input: { supabase: SupabaseClient; gateway?: PlaidGateway }) {
  const owner = await requireBusiness(input.supabase)
  const admin = createServerAdminSupabase()
  const { data, error } = await admin.from('plaid_items').select('id')
    .eq('business_id', owner.businessId).neq('connection_status', 'disconnected')
  if (error) throw new Error('CONNECTIONS_UNAVAILABLE')
  const results = []
  for (const item of data ?? []) results.push(await syncPlaidItem(item.id, input.gateway))
  return results
}

export async function disconnectPlaidItem(input: {
  supabase: SupabaseClient; itemRecordId: string; gateway?: PlaidGateway
}) {
  const owner = await requireBusiness(input.supabase)
  if (!UUID.test(input.itemRecordId)) throw new Error('INVALID_ITEM')
  const admin = createServerAdminSupabase()
  const { data: item, error: itemReadError } = await admin.from('plaid_items')
    .select('id,business_id,plaid_item_id,access_token_ciphertext,connection_status,consent_status')
    .eq('id', input.itemRecordId).eq('business_id', owner.businessId).maybeSingle()
  if (itemReadError || !item) throw new Error('ITEM_NOT_FOUND')
  if (item.connection_status !== 'disconnected') {
    const gateway = input.gateway ?? createPlaidGateway()
    if (item.consent_status !== 'revoked') {
      await gateway.removeItem(decryptPlaidAccessToken(item.access_token_ciphertext))
    }
    const { data: disconnected, error: disconnectError } = await admin.rpc('disconnect_plaid_item_state', {
      p_item_record_id: item.id, p_business_id: owner.businessId,
    })
    if (disconnectError || disconnected !== true) throw new Error('DISCONNECT_STATE_FAILED')
  }
  return { disconnected: true }
}

export { safePlaidError }
