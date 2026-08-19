import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/20260819000900_add_business_fact_history.sql', 'utf8')

describe('append-only Business fact history schema', () => {
  it('defines one immutable Business-scoped chain for the narrow sensitive fact set', () => {
    expect(sql).toContain('create table public.business_fact_events')
    for (const key of ['business_stage', 'business_start_month', 'uses_customer_job_materials',
      'keeps_future_sale_merchandise', 'prior_materials_handling']) expect(sql).toContain(`'${key}'`)
    expect(sql).toContain('business_fact_events_one_root_idx')
    expect(sql).toContain('business_fact_events_one_successor_idx')
    expect(sql).toContain('business_fact_events_reject_mutation')
    expect(sql).toContain('supersedes_event_id')
  })

  it('uses a tenant-derived atomic RPC and removes direct sensitive cache writes', () => {
    expect(sql).toContain('create or replace function public.record_business_fact_changes(')
    expect(sql).toContain('owner_user_id = authenticated_user_id for update')
    expect(sql).toContain('Business fact changed before this answer was saved')
    expect(sql).toMatch(/revoke update \([\s\S]*business_stage[\s\S]*prior_materials_handling[\s\S]*\) on public\.businesses from authenticated;/)
    expect(sql).toContain('from public, anon;')
    expect(sql).toContain('to authenticated;')
  })

  it('creates honest migration baselines without fabricating unknown facts or actors', () => {
    expect(sql).toContain("'migrated_baseline', 'migration'")
    expect(sql).toContain('where facts.fact_value is not null')
    expect(sql).toContain("'onboarding-v3-baseline:' || facts.fact_key")
    expect(sql).not.toMatch(/coalesce\(businesses\.(business_stage|uses_customer_job_materials|prior_materials_handling)/)
  })

  it('provides append-only future tax-dependency invalidation without changing bookkeeping', () => {
    expect(sql).toContain('bookkeeping_tax_treatment_business_fact_dependencies')
    expect(sql).toContain('bookkeeping_tax_treatment_invalidations')
    expect(sql).toContain('triggering_business_fact_event_id')
    expect(sql).toContain('on conflict (tax_treatment_id) do nothing')
    expect(sql).not.toMatch(/update public\.bookkeeping_(allocations|records|decisions|tax_treatments)/i)
  })

  it('keeps all history reads behind owner-only RLS and trusted writes behind the RPC', () => {
    expect(sql).toContain('alter table public.business_fact_events enable row level security')
    expect(sql).toContain('business_fact_events_select_own_business')
    expect(sql).toContain('businesses.owner_user_id = (select auth.uid())')
    expect(sql).toContain('revoke all on public.business_fact_events from public, anon, authenticated')
    expect(sql).toContain('grant select on public.business_fact_events to authenticated')
    expect(sql).not.toMatch(/grant\s+insert\s+on public\.business_fact_events to authenticated/i)
  })
})
