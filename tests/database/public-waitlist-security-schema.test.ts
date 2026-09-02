import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260901000500_secure_public_waitlist.sql', 'utf8')

describe('controlled public waitlist database contract', () => {
  it('denies browser roles direct waitlist access and leaves only server insertion', () => {
    expect(sql).toContain('drop policy if exists "waitlist_public_insert"')
    expect(sql).toContain('from public, anon, authenticated, service_role')
    expect(sql).toContain('grant insert on table public.waitlist to service_role')
    expect(sql).not.toMatch(/grant insert[^;]+to (?:anon|authenticated)/i)
  })

  it('keeps the limiter private and RLS enabled', () => {
    expect(sql).toContain('alter table public.waitlist_rate_limits enable row level security')
    expect(sql).toContain('from public, anon, authenticated, service_role')
    expect(sql).not.toMatch(/create policy[^;]+waitlist_rate_limits/is)
  })

  it('uses a fixed-search-path service-only atomic function', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain("auth.role()) <> 'service_role'")
    expect(sql).toContain('on conflict (key_hash) do update')
    expect(sql).toContain("updated_at < now() - interval '1 day'")
    expect(sql).toContain('grant execute on function public.consume_waitlist_rate_limit(text,integer,integer)\n  to service_role')
  })
})
