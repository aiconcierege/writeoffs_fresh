import 'server-only'

import { createHash } from 'node:crypto'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { createPlaidGateway } from './client'
import { syncPlaidItem } from './service'
import type { PlaidGateway } from './types'
import { verifyPlaidWebhook as verifyPlaidWebhookWithGateway } from './webhook-verification'
import {can,entitlementsFromMembership}from'../membership/entitlements'

type Row = Record<string, unknown>

export async function verifyPlaidWebhook(input: {
  rawBody: string
  verification: string | null
  gateway?: PlaidGateway
  now?: number
}) {
  return verifyPlaidWebhookWithGateway({ ...input, gateway: input.gateway ?? createPlaidGateway() })
}

export async function recordPlaidWebhook(rawBody: string, deliveryIdentity: string) {
  let payload: Row
  try { payload = JSON.parse(rawBody) as Row } catch { throw new Error('INVALID_WEBHOOK') }
  const webhookType = typeof payload.webhook_type === 'string' ? payload.webhook_type : ''
  const webhookCode = typeof payload.webhook_code === 'string' ? payload.webhook_code : ''
  const plaidItemId = typeof payload.item_id === 'string' ? payload.item_id : null
  const environment = typeof payload.environment === 'string' ? payload.environment : null
  if (!webhookType || !webhookCode) throw new Error('INVALID_WEBHOOK')
  const admin = createServerAdminSupabase()
  const { data: item, error: itemError } = plaidItemId
    ? await admin.from('plaid_items').select('id,business_id,connection_status')
      .eq('plaid_item_id', plaidItemId).eq('environment', environment).maybeSingle()
    : { data: null, error: null }
  if (itemError) throw new Error('WEBHOOK_ITEM_LOOKUP_FAILED')
  const eventHash = createHash('sha256').update(deliveryIdentity).digest('hex')
  const { data: inserted, error: eventError } = await admin.from('plaid_webhook_events').insert({
    event_hash: eventHash, plaid_item_record_id: item?.id ?? null,
    webhook_type: webhookType, webhook_code: webhookCode,
  }).select('id').maybeSingle()
  if (eventError && eventError.code !== '23505') throw new Error('WEBHOOK_RECORD_FAILED')
  if (!inserted) return { duplicate: true, itemId: item?.id ?? null, shouldSync: false }
  if (!item) return { duplicate: false, itemId: null, shouldSync: false }
  const membership=await admin.from('business_memberships').select('*').eq('business_id',item.business_id).maybeSingle()
  if(membership.error)throw new Error('MEMBERSHIP_LOOKUP_FAILED')
  const autonomous=can(entitlementsFromMembership(membership.data as Record<string,unknown>|null),'autonomous_processing')

  if (webhookType === 'TRANSACTIONS' && webhookCode === 'SYNC_UPDATES_AVAILABLE') {
    await admin.from('plaid_items').update({
      sync_requested_at: new Date().toISOString(),
      initial_update_complete: payload.initial_update_complete === true,
      historical_update_complete: payload.historical_update_complete === true,
    })
      .eq('id', item.id).neq('connection_status', 'disconnected')
    await admin.from('plaid_webhook_events').update({ processed_at: new Date().toISOString() })
      .eq('id', inserted.id)
    return { duplicate: false, itemId: item.id, shouldSync: autonomous&&item.connection_status !== 'disconnected' }
  }
  if (webhookType === 'ITEM' && webhookCode === 'ERROR') {
    const error = payload.error && typeof payload.error === 'object' ? payload.error as Row : {}
    const code = typeof error.error_code === 'string' ? error.error_code : 'ITEM_ERROR'
    await admin.from('plaid_items').update({
      connection_status: code === 'ITEM_LOGIN_REQUIRED' ? 'reconnect_required' : 'needs_attention',
      provider_error_code: code,
      provider_error_type: typeof error.error_type === 'string' ? error.error_type : 'ITEM_ERROR',
      provider_error_at: new Date().toISOString(),
    }).eq('id', item.id).neq('connection_status', 'disconnected')
  } else if (webhookType === 'ITEM' && webhookCode === 'USER_PERMISSION_REVOKED') {
    await admin.from('plaid_items').update({
      connection_status: 'reconnect_required', consent_status: 'revoked',
      provider_error_code: 'USER_PERMISSION_REVOKED', provider_error_at: new Date().toISOString(),
    }).eq('id', item.id).neq('connection_status', 'disconnected')
  } else if (webhookType === 'ITEM' && ['PENDING_DISCONNECT', 'PENDING_EXPIRATION', 'NEW_ACCOUNTS_AVAILABLE'].includes(webhookCode)) {
    await admin.from('plaid_items').update({ connection_status: 'needs_attention' })
      .eq('id', item.id).neq('connection_status', 'disconnected')
  }
  await admin.from('plaid_webhook_events').update({ processed_at: new Date().toISOString() })
    .eq('id', inserted.id)
  return { duplicate: false, itemId: item.id, shouldSync: false }
}

export async function processPlaidWebhookSync(itemId: string) {
  try { await syncPlaidItem(itemId, createPlaidGateway()) } catch (error) {
    console.error('Plaid sync signal could not be completed', {
      itemRecordId: itemId,
      error: error instanceof Error ? error.message.split(':')[0] : 'unknown',
    })
  }
}
