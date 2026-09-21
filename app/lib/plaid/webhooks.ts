import 'server-only'

import { decodeJwt } from 'jose'
import { createHash } from 'node:crypto'
import { createServerAdminSupabase } from '../../../utils/supabase/admin'
import { createPlaidGateway } from './client'
import { plaidEnvironment, plaidIsConfigured } from './config'
import { syncPlaidItem } from './service'
import type { PlaidGateway } from './types'
import { verifyPlaidWebhook as verifyPlaidWebhookWithGateway } from './webhook-verification'

type Row = Record<string, unknown>

export async function verifyPlaidWebhook(input: {
  rawBody: string
  verification: string | null
  gateway?: PlaidGateway
  now?: number
}) {
  if (!input.verification) return false
  return verifyPlaidWebhookWithGateway({ ...input, gateway: input.gateway ?? createPlaidGateway() })
}

export async function recordPlaidWebhook(rawBody: string, deliveryIdentity: string) {
  let payload: Row
  try { payload = JSON.parse(rawBody) as Row } catch { throw new Error('INVALID_WEBHOOK') }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('INVALID_WEBHOOK')
  const webhookType = typeof payload.webhook_type === 'string' ? payload.webhook_type : ''
  const webhookCode = typeof payload.webhook_code === 'string' ? payload.webhook_code : ''
  const environment = typeof payload.environment === 'string' ? payload.environment : null
  if (!webhookType || !webhookCode) throw new Error('INVALID_WEBHOOK')
  if (environment !== plaidEnvironment()) throw new Error('INVALID_WEBHOOK')
  const admin = createServerAdminSupabase()
  const { data, error } = await admin.rpc('record_plaid_webhook', {
    p_hash: createHash('sha256').update(deliveryIdentity).digest('hex'), p_payload: { ...payload, _verified_issued_at: new Date(Number(decodeJwt(deliveryIdentity).iat) * 1000).toISOString() },
  })
  if (error) throw new Error('WEBHOOK_RECORD_FAILED')
  return data as { duplicate: boolean; itemId: string | null; shouldSync: boolean }
}

export async function processPlaidWebhookSync(itemId: string) {
  const started = new Date().toISOString()
  try {
    const attempt = await createServerAdminSupabase().from('plaid_webhook_events')
      .update({ last_attempt_at: started }).eq('plaid_item_record_id', itemId)
      .in('webhook_code', ['SYNC_UPDATES_AVAILABLE', 'LOGIN_REPAIRED', 'UPDATE_COMPLETED'])
      .is('processed_at', null).lte('received_at', started)
    if (attempt.error) throw new Error('WEBHOOK_ATTEMPT_FAILED')
    const result = await syncPlaidItem(itemId, createPlaidGateway())
    if (result.busy || ('skipped' in result && result.skipped)) return
    const { error } = await createServerAdminSupabase().from('plaid_webhook_events')
      .update({ processed_at: new Date().toISOString() }).eq('plaid_item_record_id', itemId)
      .in('webhook_code', ['SYNC_UPDATES_AVAILABLE', 'LOGIN_REPAIRED', 'UPDATE_COMPLETED'])
      .is('processed_at', null).lte('received_at', started)
    if (error) throw new Error('WEBHOOK_COMPLETION_FAILED')
  } catch {
    // Durable inbox stays pending; cron retries through the same leased sync path.
    console.error('plaid_webhook_sync_pending', { itemRecordId: itemId })
  }
}

export async function retryPendingPlaidWebhooks() {
  if (!plaidIsConfigured()) return { attempted: 0 }
  const { data, error } = await createServerAdminSupabase().from('plaid_webhook_events')
    .select('plaid_item_record_id')
    .in('webhook_code', ['SYNC_UPDATES_AVAILABLE', 'LOGIN_REPAIRED', 'UPDATE_COMPLETED']).is('processed_at', null)
    .order('last_attempt_at', { nullsFirst: true }).order('received_at').limit(20)
  if (error) throw new Error('WEBHOOK_INBOX_UNAVAILABLE')
  const ids = [...new Set((data ?? []).map(row => row.plaid_item_record_id).filter(Boolean))].slice(0, 3)
  for (const id of ids) await processPlaidWebhookSync(id)
  return { attempted: ids.length }
}
