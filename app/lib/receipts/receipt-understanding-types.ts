export const RECEIPT_UNDERSTANDING_PROCESSOR_VERSION = 'receipt-understanding:r1.1'
export const RECEIPT_UNDERSTANDING_PROMPT_VERSION = 'receipt-understanding-prompt:v1'
export const RECEIPT_UNDERSTANDING_SCHEMA_VERSION = 'receipt-understanding-schema:v1'
export const RECEIPT_UNDERSTANDING_MAX_PDF_PAGES = 10

export const DOCUMENT_TYPES = ['receipt', 'invoice', 'other_business_document', 'unknown'] as const
export const UNDERSTANDING_OUTCOMES = ['understood', 'partial', 'needs_customer_help', 'not_recognized'] as const
export const AMBIGUITY_CODES = [
  'MERCHANT_MISSING', 'DATE_MISSING', 'TOTAL_MISSING', 'MULTIPLE_TOTALS',
  'MULTIPLE_DATES', 'DOCUMENT_TYPE_UNCLEAR', 'FACTS_CONFLICT', 'CONTENT_UNREADABLE',
  'FACTS_OUTSIDE_PAGE_LIMIT',
] as const
export const DOCUMENT_SIGNALS = [
  'MERCHANT_HEADER_VISIBLE', 'PURCHASE_DATE_VISIBLE', 'TOTAL_LABEL_VISIBLE',
  'AMOUNT_DUE_VISIBLE', 'RECEIPT_LAYOUT', 'INVOICE_LAYOUT', 'UNRELATED_CONTENT',
] as const
export const APPROVED_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'MXN', 'CHF'] as const
export const EVIDENCE_REGIONS = ['header', 'body', 'summary', 'footer'] as const

export type ReceiptUnderstandingProposal = {
  documentType: typeof DOCUMENT_TYPES[number]
  outcome: typeof UNDERSTANDING_OUTCOMES[number]
  merchant: null | { value: string; support: 'prominent_header' | 'explicit_label'; evidence: EvidenceReference }
  purchaseDate: null | { value: string; support: 'explicit_label' | 'document_context'; evidence: EvidenceReference }
  total: null | { currency: typeof APPROVED_CURRENCIES[number]; cents: number; support: 'labeled_total' | 'amount_due'; evidence: EvidenceReference }
  ambiguityCodes: typeof AMBIGUITY_CODES[number][]
  documentSignals: typeof DOCUMENT_SIGNALS[number][]
}

export type EvidenceReference = {
  page: number
  region: typeof EVIDENCE_REGIONS[number]
  visibleText: string
}

export type ReceiptUnderstandingValidation = {
  accepted: boolean
  codes: string[]
  proposal: ReceiptUnderstandingProposal | null
}

const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
const oneOf = <T extends readonly string[]>(value: unknown, allowed: T): value is T[number] =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
function visibleMoneyCents(value: string) {
  return [...value.matchAll(/(?:[$€£]\s*)?([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.([0-9]{2})\b/g)]
    .map((match) => Number(match[1].replaceAll(',', '')) * 100 + Number(match[2]))
}
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const

function calendarDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
    || year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function visibleCalendarDates(value: string) {
  const dates = new Set<string>()
  for (const match of value.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const parsed = calendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    if (parsed) dates.add(parsed)
  }
  for (const match of value.matchAll(/\b(\d{1,2})([\/-])(\d{1,2})\2(\d{4})\b/g)) {
    const first = Number(match[1]); const second = Number(match[3]); const year = Number(match[4])
    // Numeric day/month order is accepted only when one component cannot be a month.
    if (first > 12 && second <= 12) {
      const parsed = calendarDate(year, second, first); if (parsed) dates.add(parsed)
    } else if (second > 12 && first <= 12) {
      const parsed = calendarDate(year, first, second); if (parsed) dates.add(parsed)
    }
  }
  const monthPattern = MONTH_NAMES.join('|')
  const monthFirst = new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi')
  for (const match of value.matchAll(monthFirst)) {
    const parsed = calendarDate(Number(match[3]), MONTH_NAMES.indexOf(match[1].toLowerCase() as typeof MONTH_NAMES[number]) + 1,
      Number(match[2]))
    if (parsed) dates.add(parsed)
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\s+(\\d{4})\\b`, 'gi')
  for (const match of value.matchAll(dayFirst)) {
    const parsed = calendarDate(Number(match[3]), MONTH_NAMES.indexOf(match[2].toLowerCase() as typeof MONTH_NAMES[number]) + 1,
      Number(match[1]))
    if (parsed) dates.add(parsed)
  }
  return dates
}

function visibleDateMatches(value: string, isoDate: string) {
  const dates = visibleCalendarDates(value)
  return dates.size === 1 && dates.has(isoDate)
}

function evidence(value: unknown, processedPages: number) {
  if (!object(value) || !exactKeys(value, ['page', 'region', 'visibleText'])) return false
  return Number.isInteger(value.page) && Number(value.page) >= 1 && Number(value.page) <= processedPages
    && oneOf(value.region, EVIDENCE_REGIONS) && typeof value.visibleText === 'string'
    && value.visibleText.trim().length >= 1 && value.visibleText.length <= 160
}

export function validateReceiptUnderstandingProposal(input: {
  output: unknown
  processedPages: number
  now?: Date
  fingerprintCurrent: boolean
  customerCorrectionCurrent: boolean
}): ReceiptUnderstandingValidation {
  const codes: string[] = []
  if (!object(input.output) || !exactKeys(input.output,
    ['documentType', 'outcome', 'merchant', 'purchaseDate', 'total', 'ambiguityCodes', 'documentSignals'])) {
    return { accepted: false, codes: ['MALFORMED_STRUCTURED_OUTPUT'], proposal: null }
  }
  const value = input.output
  if (!oneOf(value.documentType, DOCUMENT_TYPES)) codes.push('INVALID_DOCUMENT_TYPE')
  if (!oneOf(value.outcome, UNDERSTANDING_OUTCOMES)) codes.push('INVALID_OUTCOME')
  if (!Array.isArray(value.ambiguityCodes) || value.ambiguityCodes.length > 10
    || value.ambiguityCodes.some((code) => !oneOf(code, AMBIGUITY_CODES))) codes.push('INVALID_AMBIGUITY_CODE')
  if (!Array.isArray(value.documentSignals) || value.documentSignals.length > 10
    || value.documentSignals.some((code) => !oneOf(code, DOCUMENT_SIGNALS))) codes.push('INVALID_DOCUMENT_SIGNAL')

  if (value.merchant !== null) {
    if (!object(value.merchant) || !exactKeys(value.merchant, ['value', 'support', 'evidence'])
      || typeof value.merchant.value !== 'string' || value.merchant.value.trim().length < 2
      || value.merchant.value.length > 300
      || !oneOf(value.merchant.support, ['prominent_header', 'explicit_label'] as const)
      || !evidence(value.merchant.evidence, input.processedPages)) codes.push('INVALID_MERCHANT_FACT')
    else if (['date', 'total', 'receipt', 'invoice', 'subtotal', 'tax', 'amount', 'purchase']
      .includes(value.merchant.value.trim().toLowerCase())) codes.push('GENERIC_MERCHANT')
    else if (!normalize(String((value.merchant.evidence as Record<string, unknown>).visibleText))
      .includes(normalize(value.merchant.value))) codes.push('MERCHANT_EVIDENCE_MISMATCH')
  }
  if (value.purchaseDate !== null) {
    if (!object(value.purchaseDate) || !exactKeys(value.purchaseDate, ['value', 'support', 'evidence'])
      || typeof value.purchaseDate.value !== 'string'
      || !oneOf(value.purchaseDate.support, ['explicit_label', 'document_context'] as const)
      || !evidence(value.purchaseDate.evidence, input.processedPages)) codes.push('INVALID_DATE_FACT')
    else {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.purchaseDate.value)
      const parsed = match ? new Date(`${value.purchaseDate.value}T00:00:00.000Z`) : null
      if (!match || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.purchaseDate.value) codes.push('INVALID_DATE')
      else if (value.purchaseDate.value > (input.now ?? new Date()).toISOString().slice(0, 10)) codes.push('FUTURE_DATE')
      else if (!visibleDateMatches(String((value.purchaseDate.evidence as Record<string, unknown>).visibleText), value.purchaseDate.value)) codes.push('DATE_EVIDENCE_MISMATCH')
      if (object(value.purchaseDate.evidence) && /\b(total|amount due|balance due)\b/i.test(String(value.purchaseDate.evidence.visibleText))) codes.push('DATE_EVIDENCE_IS_AMOUNT')
      if (object(value.purchaseDate.evidence)
        && /\b(?:payment\s*(?:id|number)|order\s*(?:id|number)|barcode|phone|telephone|tel)\b/i
          .test(String(value.purchaseDate.evidence.visibleText))) codes.push('DATE_EVIDENCE_IS_IDENTIFIER')
    }
  }
  if (value.total !== null) {
    if (!object(value.total) || !exactKeys(value.total, ['currency', 'cents', 'support', 'evidence'])
      || !oneOf(value.total.currency, APPROVED_CURRENCIES) || !Number.isSafeInteger(value.total.cents)
      || Number(value.total.cents) <= 0 || !oneOf(value.total.support, ['labeled_total', 'amount_due'] as const)
      || !evidence(value.total.evidence, input.processedPages)) codes.push('INVALID_TOTAL_FACT')
    else {
      if (/\bdate\b/i.test(String((value.total.evidence as Record<string, unknown>).visibleText))
        && !/\b(total|amount due|balance due)\b/i.test(String((value.total.evidence as Record<string, unknown>).visibleText))) codes.push('TOTAL_EVIDENCE_IS_DATE')
      if (!visibleMoneyCents(String((value.total.evidence as Record<string, unknown>).visibleText))
        .includes(Number(value.total.cents))) codes.push('TOTAL_EVIDENCE_MISMATCH')
      const digits = String(Number(value.total.cents) / 100).replace('.', '').padStart(8, '0')
      if (Number(value.total.cents) % 100 === 0 && /^\d{8}$/.test(digits)) {
        const mm = Number(digits.slice(0, 2)); const dd = Number(digits.slice(2, 4)); const yyyy = Number(digits.slice(4))
        const date = new Date(Date.UTC(yyyy, mm - 1, dd))
        if (date.getUTCFullYear() === yyyy && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd) codes.push('TOTAL_RESEMBLES_DATE')
      }
    }
  }

  const outcome = value.outcome
  const supportedDocument = value.documentType === 'receipt' || value.documentType === 'invoice'
    || value.documentType === 'other_business_document'
  if (outcome === 'understood' && (!supportedDocument || value.merchant === null
    || value.purchaseDate === null || value.total === null || (value.ambiguityCodes as unknown[]).length > 0)) codes.push('OUTCOME_FACT_MISMATCH')
  if (outcome === 'needs_customer_help' && (!supportedDocument || (value.ambiguityCodes as unknown[]).length === 0)) codes.push('HELP_WITHOUT_AMBIGUITY')
  if (outcome === 'not_recognized' && (value.documentType !== 'unknown'
    || value.merchant !== null || value.purchaseDate !== null || value.total !== null)) codes.push('NOT_RECOGNIZED_HAS_FACTS')
  if (!input.fingerprintCurrent) codes.push('STALE_DOCUMENT_FINGERPRINT')
  if (input.customerCorrectionCurrent) codes.push('CUSTOMER_CORRECTION_CURRENT')
  return { accepted: codes.length === 0, codes: [...new Set(codes)], proposal: value as ReceiptUnderstandingProposal }
}
