import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(resolve(process.cwd(), 'app/api/internal/receipts/understand/route.ts'), 'utf8')
describe('receipt understanding worker route', () => {
  it('uses timing-safe worker authentication, a bounded drain, and a sanitized inspection response', () => {
    expect(route).toContain('timingSafeEqual')
    expect(route).toContain('BOOKKEEPING_WORKER_SECRET')
    expect(route).toContain('MAX_RECEIPT_UNDERSTANDING_BATCH')
    expect(route).toContain('export async function GET')
    expect(route).toContain("Math.min(100")
    expect(route).not.toContain('storage_path')
    expect(route).not.toContain('raw_payload')
    expect(route).not.toContain('signedUrl')
  })
})
