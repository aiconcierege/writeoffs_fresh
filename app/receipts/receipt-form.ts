export type ReceiptFacts = {
  merchant: string
  occurredOn: string
  totalAmountCents: number
}

export type ReceiptFactErrors = Partial<Record<'merchant' | 'occurredOn' | 'total', string>>

export function dollarsToCents(value: string) {
  const normalized = value.trim().replace(/^\$/, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [dollars, fractional = ''] = normalized.split('.')
  const cents = Number(dollars) * 100 + Number(fractional.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

export function centsToDollars(value: number | null) {
  return value == null ? '' : (value / 100).toFixed(2)
}

export function validateReceiptFacts(input: {
  merchant: string
  occurredOn: string
  total: string
}): { facts: ReceiptFacts | null; errors: ReceiptFactErrors } {
  const errors: ReceiptFactErrors = {}
  const merchant = input.merchant.trim()
  if (!merchant) errors.merchant = 'Enter the merchant name.'
  else if (merchant.length > 500) errors.merchant = 'Merchant name is too long.'

  if (!isCalendarDate(input.occurredOn) || input.occurredOn > new Date().toISOString().slice(0, 10)) {
    errors.occurredOn = 'Enter a valid purchase date that is not in the future.'
  }
  const totalAmountCents = dollarsToCents(input.total)
  if (totalAmountCents == null) errors.total = 'Enter a positive total in dollars and cents.'

  return Object.keys(errors).length > 0
    ? { facts: null, errors }
    : { facts: { merchant, occurredOn: input.occurredOn, totalAmountCents: totalAmountCents as number }, errors }
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
