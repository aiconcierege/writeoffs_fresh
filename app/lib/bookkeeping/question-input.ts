export function parsePositiveDollarCents(value: string) {
  const trimmed = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null
  const [dollars, cents = ''] = trimmed.split('.')
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0'))
  return Number.isSafeInteger(result) && result > 0 ? result : null
}

