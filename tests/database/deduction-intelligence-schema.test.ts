import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql=readFileSync('supabase/migrations/20260824000500_add_deduction_intelligence_foundation.sql','utf8')

describe('deduction intelligence schema',()=>{
  it('uses a bounded append-only scoped fact vocabulary',()=>{
    expect(sql).toContain('create table public.deduction_business_fact_events')
    for(const key of ['phone_business_use_percentage','internet_business_use_percentage','home_office_regular_use',
      'home_office_exclusive_use','home_office_square_feet','home_total_square_feet',
      'equipment_business_use_percentage','equipment_placed_in_service_date','recurring_shared_expense_context']) expect(sql).toContain(key)
    expect(sql).toContain('deduction_fact_one_successor_idx')
    expect(sql).toContain('deduction_fact_no_mutation')
  })
  it('tracks decision and tax dependencies and requeues corrections',()=>{
    expect(sql).toContain('bookkeeping_decision_deduction_fact_dependencies')
    expect(sql).toContain('bookkeeping_tax_treatment_deduction_fact_dependencies')
    expect(sql).toContain('bookkeeping_tax_treatment_deduction_fact_invalidations')
    expect(sql).toContain("'deduction_fact_changed'")
    expect(sql).toContain('request_bookkeeping_processing')
  })
  it('keeps discovery separate from deductions and tenant-scoped',()=>{
    expect(sql).toContain('create table public.deduction_attention_events')
    expect(sql).toContain('create table public.bookkeeping_special_treatment_signals')
    expect(sql).not.toMatch(/insert into public\.bookkeeping_tax_treatments/)
    expect(sql).toContain('deduction_attentions_select_own')
  })
})
