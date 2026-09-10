import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
const sql=readFileSync('supabase/migrations/20260908000900_add_canonical_vehicle_bookkeeping.sql','utf8')
describe('vehicle bookkeeping migration',()=>{
  it('keeps separate immutable facts and current projections',()=>{
    for(const name of ['vehicle_identity_events','vehicle_tax_year_method_events','vehicle_tax_year_use_events','vehicle_expense_association_events','vehicle_deduction_assessments']){
      expect(sql).toContain(`create table public.${name}`)
    }
    expect(sql).toContain('vehicle bookkeeping history is append-only')
    expect(sql).toContain('current_vehicle_tax_year_methods')
  })
  it('stores date-effective rates and method-safe classifications',()=>{
    expect(sql).toContain("(2026,'2026-01-01','2026-06-30',72500")
    expect(sql).toContain("(2026,'2026-07-01','2026-12-31',76000")
    expect(sql).toContain("method in('standard_mileage','actual_expenses','unresolved','cpa_review')")
    expect(sql).toContain("expense_kind in('fuel','insurance','repair','maintenance','registration','tires','parking','tolls','lease_payment','other_operating','purchase','improvement')")
  })
})
