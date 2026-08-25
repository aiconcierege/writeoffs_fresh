import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(file, 'utf8')

describe('production operations contracts', () => {
  it('pins the supported Vercel Node runtime', () => {
    expect(JSON.parse(read('package.json')).engines.node).toBe('22.x')
  })

  it('keeps the processing drain authenticated, bounded, and safe to overlap', () => {
    const route = read('app/api/internal/processing/drain/route.ts')
    expect(route).toContain('timingSafeEqual')
    expect(route).toContain("request.headers.get('authorization')")
    expect(route).toContain('batchSize: 8')
    expect(route).toContain('batchSize: 12')
    expect(route).not.toMatch(/searchParams.*secret|console\.(log|error)/)
  })

  it('can pause expensive processing without dropping durable intake', () => {
    const route = read('app/api/internal/processing/drain/route.ts')
    expect(route).toContain("DOCUMENT_EXPENSIVE_PROCESSING_ENABLED !== 'false'")
    expect(route).toContain("{ paused: true, claimed: 0")
    expect(route.indexOf('drainCanonicalDocumentJobs')).toBeLessThan(route.indexOf('expensiveProcessingEnabled'))
    expect(read('docs/PRODUCTION_SECURITY_OPERATIONS.md')).toContain('DOCUMENT_EXPENSIVE_PROCESSING_ENABLED=false')
  })

  it('declares the production cron without embedding a credential', () => {
    const vercel = JSON.parse(read('vercel.json'))
    expect(vercel.crons).toEqual([{ path: '/api/internal/processing/drain', schedule: '* * * * *' }])
    expect(read('vercel.json')).not.toMatch(/secret|token|authorization/i)
  })

  it('ships the required launch runbooks', () => {
    for (const file of ['docs/PRODUCTION_SECURITY_OPERATIONS.md','docs/INCIDENT_RESPONSE.md','docs/PRODUCTION_LAUNCH_GATE.md']) {
      expect(read(file).length, file).toBeGreaterThan(1000)
    }
  })
})
