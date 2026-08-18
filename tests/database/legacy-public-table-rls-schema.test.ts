import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260818000200_secure_legacy_public_tables.sql',
  'utf8'
)

const protectedTables = [
  'waitlist',
  'mileage_trips',
  'categories',
  'rulesets',
  'subscriptions',
] as const

describe('legacy public-table RLS migration contract', () => {
  it('enables RLS and removes broad customer grants on all five tables', () => {
    for (const table of protectedTables) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(
        `revoke all privileges on table public.${table} from anon, authenticated`
      )
      expect(migration).toContain(
        `grant all privileges on table public.${table} to service_role`
      )
    }
  })

  it('keeps the waitlist write-only and limits its customer-supplied columns', () => {
    expect(migration).toContain(
      'grant insert (email, name, source) on table public.waitlist to anon, authenticated'
    )
    expect(migration).toContain('create policy "waitlist_public_insert"')
    expect(migration).not.toMatch(/grant select on table public\.waitlist to (?:anon|authenticated)/i)
  })

  it('allows authenticated reference reads without customer writes', () => {
    expect(migration).toContain('grant select on table public.categories to authenticated')
    expect(migration).toContain('grant select on table public.rulesets to authenticated')
    expect(migration).toContain('create policy "categories_read_authenticated"')
    expect(migration).toContain('create policy "rulesets_read_authenticated"')
    expect(migration).not.toMatch(/grant (?:insert|update|delete).*public\.(?:categories|rulesets).*authenticated/i)
  })

  it('creates no customer policy for subscriptions or unowned mileage', () => {
    expect(migration).not.toMatch(/create policy[^;]+on public\.(?:subscriptions|mileage_trips)/is)
    expect(migration).not.toMatch(/(?:insert into|update|delete from) public\.mileage_trips/i)
  })
})
