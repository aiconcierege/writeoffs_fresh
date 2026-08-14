import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814000100_add_v2_onboarding_foundation.sql'
  ),
  'utf8'
)

describe('v2 Business vehicle foundation', () => {
  it('creates a Business-owned vehicle table without provisioning rows', () => {
    expect(migration).toContain('create table public.business_vehicles')
    expect(migration).toContain(
      'business_id uuid not null references public.businesses(id) on delete cascade'
    )
    expect(migration).not.toMatch(/\buser_id\b/)
    expect(migration).not.toMatch(/insert\s+into\s+public\.business_vehicles/i)
  })

  it('limits active vehicles to the two available Business slots', () => {
    expect(migration).toContain('constraint business_vehicles_slot_check check (slot in (1, 2))')
    expect(migration).toContain('on public.business_vehicles (business_id, slot)')
    expect(migration).toContain('where archived_at is null')
  })

  it('supports nullable mixed use and retains archived vehicle identity', () => {
    expect(migration).toContain('is_mixed_use boolean')
    expect(migration).toContain('archived_at timestamptz')
    expect(migration).toContain('create trigger business_vehicles_protect_identity')
    expect(migration).toContain("raise exception 'business vehicle identity fields are immutable'")
  })

  it('isolates vehicle reads and writes through Business ownership', () => {
    expect(migration).toContain('alter table public.business_vehicles enable row level security')
    expect(migration).toContain('business_vehicles_select_own_business')
    expect(migration).toContain('business_vehicles_insert_own_business')
    expect(migration).toContain('business_vehicles_update_own_business')
    expect(migration).toContain('businesses.owner_user_id = (select auth.uid())')
    expect(migration).not.toMatch(/business_vehicles_delete_own_business/)
  })

  it('uses the shared updated-at trigger', () => {
    expect(migration).toContain('create trigger business_vehicles_set_updated_at')
    expect(migration).toContain('execute function public.set_updated_at()')
  })
})
