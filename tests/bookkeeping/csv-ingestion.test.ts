import { describe, expect, it } from 'vitest'
import {
  normalizeCsvAmountToCents,
  normalizeCsvDate,
  prepareCsvFinancialRows,
} from '../../app/lib/bookkeeping/csv-ingestion'

const mapping = { date: 'Date', description: 'Description', amount: 'Amount' }

describe('canonical CSV normalization', () => {
  it('normalizes supported dates without accepting impossible calendar dates', () => {
    expect(normalizeCsvDate('2026-08-19')).toBe('2026-08-19')
    expect(normalizeCsvDate('8/19/26')).toBe('2026-08-19')
    expect(normalizeCsvDate('19.8.2026')).toBe('2026-08-19')
    expect(normalizeCsvDate('2026-02-30')).toBeNull()
  })

  it('uses exact integer cents and rejects zero, excess precision, and unsafe values', () => {
    expect(normalizeCsvAmountToCents('-123.45')).toBe(-12_345)
    expect(normalizeCsvAmountToCents('($1,234.50)')).toBe(-123_450)
    expect(normalizeCsvAmountToCents('+20')).toBe(2_000)
    expect(normalizeCsvAmountToCents('1.005')).toBeNull()
    expect(normalizeCsvAmountToCents('0')).toBeNull()
    expect(normalizeCsvAmountToCents('900719925474099')).toBeNull()
  })

  it('creates stable versioned identities from date, signed amount, currency, and raw description', () => {
    const input = {
      mapping,
      rows: [{ Date: '2026-08-19', Description: 'Hardware Store #12345', Amount: '-42.10' }],
    }
    const first = prepareCsvFinancialRows(input).rows[0]
    const retried = prepareCsvFinancialRows(input).rows[0]

    expect(first).toEqual(retried)
    expect(first.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(first.legacyDedupeHash).toMatch(/^[a-f0-9]{40}$/)
    expect(first.normalizedDescription).toBe('HARDWARE STORE')
  })

  it('does not suppress rows merely because merchant and amount match', () => {
    const result = prepareCsvFinancialRows({
      mapping,
      rows: [
        { Date: '2026-08-18', Description: 'Supply Shop', Amount: '-25.00' },
        { Date: '2026-08-19', Description: 'Supply Shop', Amount: '-25.00' },
      ],
    })
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].sourceFingerprint).not.toBe(result.rows[1].sourceFingerprint)
  })

  it('converges exact duplicate source rows within one request', () => {
    const row = { Date: '2026-08-19', Description: 'Supply Shop', Amount: '-25.00' }
    const result = prepareCsvFinancialRows({ mapping, rows: [row, row] })
    expect(result.rows).toHaveLength(1)
  })

  it('reports invalid rows without weakening valid source facts', () => {
    const result = prepareCsvFinancialRows({
      mapping,
      rows: [
        { Date: 'bad', Description: 'One', Amount: '-10.00' },
        { Date: '2026-08-19', Description: 'Two', Amount: 'not-money' },
        { Date: '2026-08-19', Description: 'Three', Amount: '-10.00' },
      ],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.errors.map(({ row }) => row)).toEqual([2, 3])
  })
})
