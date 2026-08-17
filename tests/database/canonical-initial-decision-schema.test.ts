import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260817000100_add_canonical_initial_decision_function.sql'
  ),
  'utf8'
)

describe('canonical initial decision database function', () => {
  it('creates only the fixed unresolved system decision', () => {
    expect(migration).toContain("null, 'unresolved', 'needs_review', 'system'")
    expect(migration).toContain("'Awaiting bookkeeping review.'")
    expect(migration).not.toContain('p_treatment')
    expect(migration).not.toContain('p_bookkeeping_nature')
    expect(migration).not.toContain('p_allocations')
  })

  it('checks authenticated Business ownership and exposes no anonymous access', () => {
    expect(migration).toContain('businesses.owner_user_id = (select auth.uid())')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path =')
    expect(migration).toContain('from public, anon')
    expect(migration).toContain('to authenticated')
    expect(migration).not.toContain('to service_role')
  })
})
