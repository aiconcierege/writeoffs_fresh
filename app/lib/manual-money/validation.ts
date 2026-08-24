export type ManualMoneyDirection = 'received' | 'spent'

export const RECEIVED_METHODS = ['cash', 'check', 'zelle_ach', 'card', 'other'] as const
export const SPENT_METHODS = ['cash', 'personal_card_account', 'check', 'other'] as const

export function parseDollarCents(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null
  const [dollars, fraction = ''] = text.split('.')
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

function optionalText(value: unknown, limit: number) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text && text.length <= limit ? text : undefined
}

export function validateManualMoney(input: unknown, expectedDirection?: ManualMoneyDirection) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false as const, error: 'Enter the activity details.' }
  const row = input as Record<string, unknown>
  const direction = row.direction
  if ((direction !== 'received' && direction !== 'spent') || (expectedDirection && direction !== expectedDirection)) {
    return { ok: false as const, error: 'Choose whether money was received or spent.' }
  }
  const amountCents = parseDollarCents(row.amount)
  if (!amountCents) return { ok: false as const, error: 'Enter a positive amount with no more than two decimal places.' }
  const occurredOn = typeof row.occurredOn === 'string' ? row.occurredOn : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || Number.isNaN(Date.parse(`${occurredOn}T00:00:00Z`))
    || occurredOn > new Date().toISOString().slice(0, 10)) {
    return { ok: false as const, error: 'Choose a valid date that is not in the future.' }
  }
  const methods = direction === 'received' ? RECEIVED_METHODS : SPENT_METHODS
  if (!methods.includes(row.paymentMethod as never)) return { ok: false as const, error: 'Choose how the money was paid.' }
  const fields = {
    counterpartyName: optionalText(row.counterpartyName, 200), description: optionalText(row.description, 500),
    jobLabel: optionalText(row.jobLabel, 200), location: optionalText(row.location, 300), note: optionalText(row.note, 1000),
  }
  if (Object.values(fields).some((value) => value === undefined)) return { ok: false as const, error: 'One of the details is too long.' }
  return { ok: true as const, value: { direction, amountCents, occurredOn,
    paymentMethod: row.paymentMethod as string, currency: 'USD', ...fields } }
}

export function manualPaymentMethodLabel(value: string) {
  return ({ cash: 'Cash', check: 'Check', zelle_ach: 'Zelle / ACH', card: 'Card',
    personal_card_account: 'Personal card/account', other: 'Other' } as Record<string, string>)[value] ?? 'Other'
}
