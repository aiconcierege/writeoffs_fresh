import 'server-only'

import type { PlaidEnvironmentName } from './types'

export function plaidEnvironment(): PlaidEnvironmentName {
  const value = process.env.PLAID_ENV ?? 'sandbox'
  if (value !== 'sandbox' && value !== 'development' && value !== 'production') {
    throw new Error('PLAID_ENV must be sandbox, development, or production.')
  }
  return value
}

export function plaidIsConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && process.env.PLAID_TOKEN_ENCRYPTION_KEY)
}

export function plaidSandboxLinkEnabled() {
  return plaidEnvironment() === 'sandbox' && process.env.PLAID_SANDBOX_LINK_ENABLED === 'true'
}

export function requirePlaidSandboxLink() {
  if (!plaidSandboxLinkEnabled()) throw new Error('Plaid Sandbox Link is not enabled.')
}

export function requirePlaidConfig() {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  const webhook = process.env.PLAID_WEBHOOK_URL
  if (!clientId || !secret) throw new Error('Plaid server credentials are unavailable.')
  return {
    clientId,
    secret,
    environment: plaidEnvironment(),
    webhook: webhook || undefined,
    redirectUri: process.env.PLAID_REDIRECT_URI || undefined,
  }
}
