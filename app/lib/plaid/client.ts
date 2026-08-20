import 'server-only'

import {
  Configuration, CountryCode, CreditAccountSubtype, DepositoryAccountSubtype,
  PlaidApi, PlaidEnvironments, Products,
  type LinkTokenCreateRequest,
} from 'plaid'
import { requirePlaidConfig } from './config'
import type { PlaidGateway } from './types'

export function createPlaidGateway(): PlaidGateway {
  const config = requirePlaidConfig()
  const client = new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[config.environment],
    baseOptions: { headers: {
      'PLAID-CLIENT-ID': config.clientId,
      'PLAID-SECRET': config.secret,
      'Plaid-Version': '2020-09-14',
    } },
  }))
  return {
    async createLinkToken(input) {
      const response = await client.linkTokenCreate(input as unknown as LinkTokenCreateRequest)
      return response.data
    },
    async exchangePublicToken(publicToken) {
      const response = await client.itemPublicTokenExchange({ public_token: publicToken })
      return response.data
    },
    async getAccounts(accessToken) {
      const response = await client.accountsGet({ access_token: accessToken })
      return { accounts: response.data.accounts as unknown[], item: response.data.item as unknown as Record<string, unknown> }
    },
    async syncTransactions(accessToken, cursor) {
      const response = await client.transactionsSync({ access_token: accessToken, cursor, count: 500 })
      return response.data
    },
    async removeItem(accessToken) {
      await client.itemRemove({ access_token: accessToken })
    },
    async getWebhookVerificationKey(keyId) {
      const response = await client.webhookVerificationKeyGet({ key_id: keyId })
      return response.data.key as unknown as Record<string, unknown>
    },
  }
}

export function newItemLinkRequest(input: {
  clientUserId: string
  webhook?: string
  redirectUri?: string
}) {
  return {
    client_name: 'WriteOffs',
    language: 'en',
    country_codes: [CountryCode.Us],
    products: [Products.Transactions],
    user: { client_user_id: input.clientUserId },
    webhook: input.webhook,
    redirect_uri: input.redirectUri,
    transactions: { days_requested: 730 },
    account_filters: {
      depository: { account_subtypes: [DepositoryAccountSubtype.Checking, DepositoryAccountSubtype.Savings] },
      credit: { account_subtypes: [CreditAccountSubtype.CreditCard] },
    },
  } satisfies LinkTokenCreateRequest
}

export function updateModeLinkRequest(input: {
  clientUserId: string
  accessToken: string
  webhook?: string
  redirectUri?: string
}) {
  return {
    client_name: 'WriteOffs', language: 'en', country_codes: [CountryCode.Us],
    user: { client_user_id: input.clientUserId }, access_token: input.accessToken,
    webhook: input.webhook, redirect_uri: input.redirectUri,
  } satisfies LinkTokenCreateRequest
}
