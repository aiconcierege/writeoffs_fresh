import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync('supabase/migrations/20260819000800_rebuild_v1_onboarding.sql', 'utf8')

describe('canonical onboarding v3 schema', () => {
  it('adds nullable factual fields and constrained server-derived eligibility', () => {
    for (const field of ['business_profile_context', 'schedule_c_eligibility', 'business_stage',
      'uses_customer_job_materials', 'keeps_future_sale_merchandise', 'prior_materials_handling',
      'catch_up_start_date', 'v1_support_status', 'v1_support_reason']) {
      expect(sql).toContain(`add column ${field}`)
    }
    expect(sql).toContain('add column v1_support_status text generated always as')
    expect(sql).toContain("when schedule_c_eligibility = 'yes' and keeps_future_sale_merchandise = 'no' then 'eligible'")
  })
  it('preserves one Business, legacy answers, and existing RLS', () => {
    expect(sql).not.toMatch(/create\s+table\s+public\.businesses/i)
    expect(sql).not.toMatch(/drop\s+(table|column|policy)/i)
    expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i)
    expect(sql).toContain(') on public.businesses to authenticated;')
    expect(sql).toContain('grant update (vertical) on public.profiles to authenticated;')
    expect(sql).not.toMatch(/grant\s+(all|insert|delete)\b/i)
    expect(sql).not.toMatch(/grant\s+update\s+on\s+public\.businesses/i)
    const businessGrant = sql.match(/grant update \(([\s\S]*?)\) on public\.businesses to authenticated/i)?.[1]
    expect(businessGrant).toBeTruthy()
    expect(businessGrant).not.toContain('owner_user_id')
    expect(businessGrant).not.toContain('v1_support_status')
  })
  it('derives only explicit Profile and federal-reporting answers', () => {
    expect(sql).toContain('business_profile_context = profiles.vertical')
    expect(sql).toContain("federal_tax_reporting_type = 'schedule_c' then 'yes'")
    expect(sql).not.toMatch(/set\s+(uses_customer_job_materials|keeps_future_sale_merchandise|prior_materials_handling|business_stage|catch_up_start_date)\s*=/i)
  })
  it('keeps Profile context synchronized into the same Business path', () => {
    expect(sql).toContain('create or replace function public.sync_profile_vertical_to_business()')
    expect(sql).toContain('business_profile_context = new.vertical')
  })
})
