import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(
  process.cwd(), 'supabase/migrations/20260820000300_add_bookkeeping_ai_shadow_audit.sql',
), 'utf8')

describe('AI bookkeeping shadow audit schema', () => {
  it('is additive, write-disabled, append-only, and customer-inaccessible', () => {
    expect(sql).toContain('create table public.bookkeeping_ai_shadow_evaluations')
    expect(sql).toContain('write_enabled boolean not null default false')
    expect(sql).toContain('bookkeeping_ai_shadow_write_disabled_check check (write_enabled = false)')
    expect(sql).toContain('before update or delete')
    expect(sql).toContain('revoke all on public.bookkeeping_ai_shadow_evaluations from public, anon, authenticated')
    expect(sql).toContain('grant select, insert on public.bookkeeping_ai_shadow_evaluations to service_role')
    expect(sql).not.toMatch(/bookkeeping_(decisions|allocations|review_events|tax_treatments)\s+(set|values)/i)
  })

  it('enforces tenant identity and completed-evaluation idempotency', () => {
    expect(sql).toContain('foreign key (bookkeeping_record_id, business_id)')
    expect(sql).toContain('bookkeeping_ai_shadow_completed_identity_idx')
    expect(sql).toContain("where validation_status <> 'provider_error'")
    expect(sql).toContain("(select auth.role()) <> 'service_role'")
  })
})
