import {afterEach,describe,expect,it,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {BookkeepingEvaluationSnapshot} from '../../app/lib/bookkeeping/deterministic-evaluator'
const {reports}=vi.hoisted(()=>({reports:vi.fn()}))
vi.mock('../../app/lib/mileage/repository',()=>({loadVehicleTaxYearReports:reports}))
import {processVehicleExpense} from '../../app/lib/bookkeeping/vehicle-processing'
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks()})
describe('vehicle assessment annual-question timing',()=>{
 it.each([2025,2026])('preserves assessment while requesting only completed-year facts (%i)',async year=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T18:00:00Z'))
  reports.mockResolvedValue([{vehicleId:'vehicle',displayName:'My car',allocationBasisPoints:null,method:'actual_expenses',expenses:[],cpaReviewReasons:[],version:'test'}])
  const insert=vi.fn().mockResolvedValue({error:null}),rpc=vi.fn().mockResolvedValue({error:null})
  const admin={rpc,from:vi.fn((table:string)=>{
   const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='current_vehicle_expense_associations'?{vehicle_id:'vehicle'}:null}),insert}
   return q
  })} as unknown as SupabaseClient
  const snapshot={businessId:'business',recordId:'record',description:'Vehicle lease payment',occurredOn:`${year}-09-01`,currentDecision:{bookkeepingNature:'expense',treatment:'business',provenance:'automation',id:'decision'}} as BookkeepingEvaluationSnapshot
  expect(await processVehicleExpense({admin,snapshot})).toMatchObject({outcome:'associated',kind:'lease_payment'})
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({status:'requires_facts',tax_year:year}))
  if(year===2026)expect(rpc).not.toHaveBeenCalled()
  else expect(rpc).toHaveBeenCalledWith('open_deduction_attention',expect.objectContaining({p_fact_type:'vehicle_total_miles',p_scope_key:'vehicle:2025'}))
 })
})
