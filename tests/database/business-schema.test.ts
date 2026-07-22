import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260722000200_create_businesses.sql'),
  'utf8'
)

describe('business schema contract', () => {
  it('enforces one business per authenticated user', () => {
    expect(migration).toContain('owner_user_id uuid not null references auth.users(id) on delete cascade')
    expect(migration).toContain('constraint businesses_one_per_user unique (owner_user_id)')
  })

  it('limits the MVP to supported business types and cash accounting', () => {
    expect(migration).toContain("entity_type in ('sole_proprietor', 'single_member_llc')")
    expect(migration).toContain("accounting_method = 'cash'")
    expect(migration).toContain("constraint businesses_country_check check (country = 'US')")
  })

  it('provisions existing and future authenticated users', () => {
    expect(migration).toContain('from auth.users as users')
    expect(migration).toContain('create trigger create_business_after_user_signup')
  })

  it('isolates business records with row level security', () => {
    expect(migration).toContain('alter table public.businesses enable row level security')
    expect(migration).toContain('(select auth.uid()) = owner_user_id')
  })
})
