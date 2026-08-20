import { createHash } from 'node:crypto'
import type { PlaidAccountInput, PlaidTransactionEvent } from './types'

type Row = Record<string, unknown>

function text(row: Row, key: string) { return typeof row[key] === 'string' ? row[key] as string : null }
function object(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {} }

export function plaidAmountToCanonicalCents(amount: unknown) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error('Plaid transaction amount is invalid.')
  const cents = Math.round(amount * 100)
  if (!Number.isSafeInteger(cents) || cents === 0 || Math.abs(amount * 100 - cents) > 1e-6) {
    throw new Error('Plaid transaction amount cannot be represented as exact cents.')
  }
  // Plaid positive is money leaving an account. Canonical positive is inflow.
  return -cents
}

export function normalizePlaidAccount(value: unknown): PlaidAccountInput | null {
  const row = object(value)
  const id = text(row, 'account_id')
  const type = text(row, 'type')
  const subtype = text(row, 'subtype')
  const balances = object(row.balances)
  const currency = (text(balances, 'iso_currency_code') ?? 'USD').toUpperCase()
  let accountType: PlaidAccountInput['account_type'] | null = null
  if (type === 'depository' && subtype === 'checking') accountType = 'checking'
  else if (type === 'depository' && subtype === 'savings') accountType = 'savings'
  else if (type === 'credit' && subtype === 'credit card') accountType = 'credit_card'
  if (!id || !accountType || !/^[A-Z]{3}$/.test(currency)) return null
  const mask = text(row, 'mask')
  return {
    account_id: id,
    display_name: text(row, 'official_name') ?? text(row, 'name') ?? 'Connected account',
    account_type: accountType,
    account_subtype: subtype,
    mask: mask && /^\d{4}$/.test(mask) ? mask : null,
    currency,
  }
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function normalizePlaidTransaction(value: unknown, eventType: 'added' | 'modified'): PlaidTransactionEvent {
  const row = object(value)
  const transactionId = text(row, 'transaction_id')
  const accountId = text(row, 'account_id')
  const date = text(row, 'date')
  const currency = (text(row, 'iso_currency_code') ?? '').toUpperCase()
  if (!transactionId || !accountId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Plaid transaction is missing required source facts.')
  }
  const evidence = {
    personal_finance_category: row.personal_finance_category ?? null,
    transaction_code: row.transaction_code ?? null,
    merchant_entity_id: text(row, 'merchant_entity_id'),
    website: text(row, 'website'),
  }
  const facts = {
    transaction_id: transactionId,
    account_id: accountId,
    pending_transaction_id: text(row, 'pending_transaction_id'),
    transaction_date: date,
    authorized_date: text(row, 'authorized_date'),
    amount_cents: plaidAmountToCanonicalCents(row.amount),
    currency,
    merchant_name: text(row, 'merchant_name'),
    original_description: text(row, 'original_description') ?? text(row, 'name') ?? 'Connected transaction',
    pending: row.pending === true,
    payment_channel: text(row, 'payment_channel'),
    provider_evidence: evidence,
  }
  return { event_type: eventType, ...facts, source_hash: stableHash(facts) }
}

export function normalizePlaidRemoval(value: unknown): PlaidTransactionEvent {
  const row = object(value)
  const transactionId = text(row, 'transaction_id')
  if (!transactionId) throw new Error('Plaid removal is missing transaction identity.')
  return {
    event_type: 'removed', transaction_id: transactionId, account_id: null,
    pending_transaction_id: null, source_hash: stableHash({ removed: transactionId }),
    transaction_date: null, authorized_date: null, amount_cents: null, currency: null,
    merchant_name: null, original_description: null, pending: null,
    payment_channel: null, provider_evidence: {},
  }
}
