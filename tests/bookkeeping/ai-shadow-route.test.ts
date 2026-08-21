import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(join(
  process.cwd(), 'app/api/internal/bookkeeping/shadow/route.ts',
), 'utf8')

describe('AI shadow inspection endpoint', () => {
  it('is internal, bounded, read-only, and does not expose secrets or prompts', () => {
    expect(route).toContain('BOOKKEEPING_WORKER_SECRET')
    expect(route).toContain('timingSafeEqual')
    expect(route).toContain('Math.min(100')
    expect(route).toContain(".from('bookkeeping_ai_shadow_evaluations')")
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
    expect(route).not.toMatch(/OPENAI_API_KEY|access_token|instructions|prompt/i)
  })
})
