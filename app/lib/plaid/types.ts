export type PlaidEnvironmentName = 'sandbox' | 'development' | 'production'

export type PlaidAccountInput = {
  account_id: string
  display_name: string
  account_type: 'checking' | 'savings' | 'credit_card'
  account_subtype: string | null
  mask: string | null
  currency: string
}

export type PlaidTransactionEvent = {
  event_type: 'added' | 'modified' | 'removed'
  transaction_id: string
  account_id: string | null
  pending_transaction_id: string | null
  source_hash: string
  transaction_date: string | null
  authorized_date: string | null
  amount_cents: number | null
  currency: string | null
  merchant_name: string | null
  original_description: string | null
  pending: boolean | null
  payment_channel: string | null
  provider_evidence: Record<string, unknown>
}

export type PlaidSyncPage = {
  added: unknown[]
  modified: unknown[]
  removed: Array<{ transaction_id?: string }>
  next_cursor: string
  has_more: boolean
}

export interface PlaidGateway {
  createLinkToken(input: Record<string, unknown>): Promise<{ link_token: string; expiration: string }>
  exchangePublicToken(publicToken: string): Promise<{ access_token: string; item_id: string; request_id?: string }>
  getAccounts(accessToken: string): Promise<{ accounts: unknown[]; item?: Record<string, unknown> }>
  syncTransactions(accessToken: string, cursor?: string): Promise<PlaidSyncPage>
  removeItem(accessToken: string): Promise<void>
  getWebhookVerificationKey(keyId: string): Promise<Record<string, unknown>>
}
