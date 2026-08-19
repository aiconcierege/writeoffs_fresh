import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { POST } from '../../app/api/writeoffs/check/route'

describe('legacy tax lookup safety boundary', () => {
  it('fails closed without merchant/category inference or tax conclusions', async () => {
    const response = await POST()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'tax_rules_unavailable' })
    const source = readFileSync('app/api/writeoffs/check/route.ts', 'utf8')
    expect(source).not.toMatch(/classifyFromKeywords|canon\.json|verdict:|'Yes'|'Depends'/i)
  })
})
