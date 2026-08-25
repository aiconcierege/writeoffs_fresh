import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReceiptText, ORDINARY_VISION_PAGE_LIMIT, STATEMENT_CHUNK_PAGES,
  STATEMENT_FILE_BYTES_MAX, STATEMENT_PAGE_LIMIT } from '../../app/lib/documents/durable-processing'

const source = (path: string) => readFileSync(path, 'utf8')

describe('durable document processing', () => {
  it('uses labeled exact-cent totals rather than payment IDs', () => {
    expect(parseReceiptText('FAST FOOD\n24/02/2021 at 1:50 PM\nTOTAL: $52.50\nPAYMENT ID 276131704'))
      .toMatchObject({ merchant: 'FAST FOOD', totalAmountCents: 5250 })
    expect(parseReceiptText('Corner Coffee Co.\nMay 18, 2025\nPAYMENT ID 97201'))
      .toMatchObject({ merchant: 'Corner Coffee Co.', totalAmountCents: null })
  })
  it('keeps receipt vision and statement protection bounds distinct', () => {
    expect(ORDINARY_VISION_PAGE_LIMIT).toBe(10); expect(STATEMENT_PAGE_LIMIT).toBe(500)
    expect(STATEMENT_CHUNK_PAGES).toBe(25); expect(STATEMENT_FILE_BYTES_MAX).toBe(100 * 1024 * 1024)
  })
  it('uses typed claims, bounded work, timeouts, and extraction caching', () => {
    const worker = source('app/lib/documents/durable-processing.ts')
    expect(worker).toContain("['canonical_receipt_extraction','statement_inspection']")
    expect(worker).toContain(".eq('extraction_key', 'vision:v1')")
    expect(worker).toContain('AbortController')
    expect(worker).not.toMatch(/console\.(log|error).*text|signedUrl/i)
  })
  it('has one protected bounded runner for repeated scheduled invocation', () => {
    const route = source('app/api/internal/processing/drain/route.ts')
    expect(route).toContain('BOOKKEEPING_WORKER_SECRET'); expect(route).toContain('drainCanonicalDocumentJobs')
    expect(route).toContain('drainBookkeepingProcessingJobs'); expect(route).toContain('documentQueueHealth')
    expect(source('vercel.json')).toContain('/api/internal/processing/drain')
  })
})
