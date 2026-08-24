import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(),'supabase/migrations/20260824000200_add_canonical_business_mileage.sql'),'utf8')
describe('canonical Business mileage schema',()=>{
  it('uses new Business-owned immutable tables and never revives legacy mileage',()=>{
    expect(sql).toContain('create table public.canonical_mileage_entries')
    expect(sql).toContain('create table public.canonical_mileage_events')
    expect(sql).toContain('canonical_mileage_entries_append_only')
    expect(sql).not.toMatch(/(?:insert into|update|delete from) public\.mileage_trips/i)
  })
  it('enforces tenant, vehicle, exact units, leaf, and idempotency integrity',()=>{
    expect(sql).toContain('canonical_mileage_vehicle_fkey')
    expect(sql).toContain('original_miles_milli > 0')
    expect(sql).toContain('canonical_mileage_event_leaf_unique')
    expect(sql).toContain('canonical_mileage_request_unique')
    expect(sql).toContain('mileage actor does not own Business')
  })
  it('exposes current facts without granting direct mutation',()=>{
    expect(sql).toContain('create view public.current_canonical_mileage_entries')
    expect(sql).toContain("event.event_type<>'voided'")
    expect(sql).toContain('revoke insert,update,delete on public.canonical_mileage_entries')
  })
})
