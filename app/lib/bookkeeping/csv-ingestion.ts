import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CsvColumnMapping = {
  date: string | null
  description: string | null
  amount: string | null
}

export type CsvImportError = {
  row: number
  reason: string
}

export type PreparedCsvFinancialRow = {
  rowNumber: number
  transactionDate: string
  amountCents: number
  currency: 'USD'
  rawDescription: string
  normalizedDescription: string
  sourceFingerprint: string
  legacyDedupeHash: string
}

export type CsvIngestionResult = {
  imported: number
  duplicates: number
  processed: number
}

const MAX_DESCRIPTION_LENGTH = 512
const MAX_IMPORT_ROWS = 1_000

function hash(algorithm: 'sha1' | 'sha256', value: string) {
  return createHash(algorithm).update(value, 'utf8').digest('hex')
}

export function normalizeCsvDate(input: string): string | null {
  const value = input.trim()
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (match) return validatedDate(match[1], match[2], match[3])

  match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value)
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3]
    return validatedDate(year, match[1], match[2])
  }

  match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(value)
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3]
    return validatedDate(year, match[2], match[1])
  }

  return null
}

function validatedDate(year: string, month: string, day: string) {
  const normalized = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? null
    : normalized
}

export function normalizeCsvAmountToCents(input: string): number | null {
  let value = input.trim().replace(/[$,\s]/g, '')
  const parenthesized = /^\(.*\)$/.test(value)
  if (parenthesized) value = value.slice(1, -1)
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value)) return null

  const sign = (value.startsWith('-') ? -1 : 1) * (parenthesized ? -1 : 1)
  const unsigned = value.replace(/^[+-]/, '')
  const [whole, fraction = ''] = unsigned.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  const signed = sign * cents
  return Number.isSafeInteger(signed) && signed !== 0 ? signed : null
}

export function normalizeCsvDescription(raw: string) {
  return raw
    .slice(0, MAX_DESCRIPTION_LENGTH)
    .toUpperCase()
    .replace(/\s+#?\d{3,}\b/g, '')
    .trim()
}

function sourceFingerprint(input: {
  transactionDate: string
  amountCents: number
  currency: string
  rawDescription: string
}) {
  return hash(
    'sha256',
    `csv:v1\n${input.transactionDate}\n${input.amountCents}\n${input.currency}\n${input.rawDescription}`
  )
}

export function prepareCsvFinancialRows(input: {
  mapping: CsvColumnMapping
  rows: Record<string, string>[]
}): { rows: PreparedCsvFinancialRow[]; errors: CsvImportError[] } {
  const { date, description, amount } = input.mapping
  if (!date || !description || !amount) {
    throw new Error('Mapping must include date, description, and amount.')
  }
  if (input.rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`CSV imports are limited to ${MAX_IMPORT_ROWS} rows at a time.`)
  }

  const prepared: PreparedCsvFinancialRow[] = []
  const errors: CsvImportError[] = []
  const seen = new Set<string>()

  input.rows.forEach((row, index) => {
    const rowNumber = index + 2
    const rawDate = String(row?.[date] ?? '').trim()
    const rawDescription = String(row?.[description] ?? '')
      .trim()
      .slice(0, MAX_DESCRIPTION_LENGTH)
    const rawAmount = String(row?.[amount] ?? '').trim()
    const transactionDate = normalizeCsvDate(rawDate)
    if (!transactionDate) {
      errors.push({ row: rowNumber, reason: `Invalid date: "${rawDate}"` })
      return
    }

    const amountCents = normalizeCsvAmountToCents(rawAmount)
    if (amountCents === null) {
      errors.push({ row: rowNumber, reason: `Invalid nonzero amount: "${rawAmount}"` })
      return
    }

    const normalizedDescription = normalizeCsvDescription(rawDescription)
    const canonicalFingerprint = sourceFingerprint({
      transactionDate,
      amountCents,
      currency: 'USD',
      rawDescription,
    })
    if (seen.has(canonicalFingerprint)) return
    seen.add(canonicalFingerprint)

    prepared.push({
      rowNumber,
      transactionDate,
      amountCents,
      currency: 'USD',
      rawDescription,
      normalizedDescription,
      sourceFingerprint: canonicalFingerprint,
      legacyDedupeHash: hash(
        'sha1',
        `${transactionDate}|${amountCents}|${normalizedDescription}|csv`
      ),
    })
  })

  return { rows: prepared, errors }
}

export async function ingestCsvFinancialActivity(input: {
  supabase: SupabaseClient
  rows: PreparedCsvFinancialRow[]
}): Promise<CsvIngestionResult> {
  const {
    data: { user },
    error: authError,
  } = await input.supabase.auth.getUser()
  if (authError || !user) throw new Error('An authenticated user is required.')

  if (input.rows.length === 0) {
    return { imported: 0, duplicates: 0, processed: 0 }
  }

  const { data, error } = await input.supabase.rpc('ingest_csv_financial_activity', {
    p_rows: input.rows.map((row) => ({
      row_number: row.rowNumber,
      transaction_date: row.transactionDate,
      amount_cents: row.amountCents,
      currency: row.currency,
      raw_description: row.rawDescription,
      normalized_description: row.normalizedDescription,
      source_fingerprint: row.sourceFingerprint,
      legacy_dedupe_hash: row.legacyDedupeHash,
    })),
  })
  if (error) throw new Error('Canonical CSV import failed.')
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Canonical CSV import returned an invalid result.')
  }

  const result = data as Record<string, unknown>
  return {
    imported: Number(result.imported ?? 0),
    duplicates: Number(result.duplicates ?? 0),
    processed: Number(result.processed ?? 0),
  }
}
