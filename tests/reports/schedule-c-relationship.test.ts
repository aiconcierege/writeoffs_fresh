import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('canonical Reports and export wiring', () => {
  it('uses one authenticated canonical report service across customer report paths', () => {
    for (const file of ['app/reports/schedule-c/page.tsx', 'app/api/reports/summary/route.ts',
      'app/api/export/csv/route.ts', 'app/api/transactions/export/route.ts']) {
      expect(source(file)).toContain('getAuthenticatedCanonicalReport')
      expect(source(file)).not.toContain(".from('transactions')")
      expect(source(file)).not.toContain('.from("transactions")')
    }
  })

  it('does not expose Packs or guess unresolved tax categories', () => {
    const page = source('app/reports/schedule-c/page.tsx')
    expect(page).not.toMatch(/General|Realtor|pack/i)
    expect(page).toContain('not guessed')
  })
})
