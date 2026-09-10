import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {describe,expect,it} from 'vitest'
import {provisionLocalCanonicalOwner} from '../helpers/local-canonical'
import {loadVehicleTaxYearReports} from '../../app/lib/mileage/repository'
import {drainBookkeepingProcessingJobs} from '../../app/lib/bookkeeping/processing'
import {getAuthenticatedCanonicalReport} from '../../app/lib/bookkeeping/reporting-service'

const url=process.env.LOCAL_SUPABASE_URL,anonKey=process.env.LOCAL_SUPABASE_ANON_KEY,serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const suite=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&url&&anonKey&&serviceKey?describe.sequential:describe.skip

suite('canonical vehicle bookkeeping',()=>{
  it('versions vehicle facts, calculates methods, and fails closed across tenants',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'vehicle-owner',amounts:[-10000]})
    const other=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'vehicle-other',amounts:[-200]})
    const {data:vehicle,error:vehicleError}=await owner.customer.from('business_vehicles').insert({business_id:owner.businessId,slot:1,display_name:'Blue van',is_mixed_use:true}).select().single()
    expect(vehicleError).toBeNull()
    const identity=await owner.customer.rpc('record_vehicle_identity',{p_vehicle_id:vehicle!.id,p_expected_event_id:null,p_ownership:'owned',p_business_use_began_on:'2026-01-01',p_lease_started_on:null,p_lease_ended_on:null,p_request_key:`identity-${randomUUID()}`})
    expect(identity.error).toBeNull()
    const method=await owner.customer.rpc('record_vehicle_tax_year_method',{p_vehicle_id:vehicle!.id,p_tax_year:2026,p_expected_event_id:null,p_method:'standard_mileage',p_request_key:`method-${randomUUID()}`})
    expect(method.error).toBeNull()
    const entryId=randomUUID();expect((await owner.customer.rpc('record_canonical_mileage',{p_id:entryId,p_vehicle_id:vehicle!.id,p_miles_milli:10_000,p_occurred_on:'2026-07-02',p_job_label:null,p_destination:'Client',p_business_purpose:'Client visit',p_request_key:`trip-${randomUUID()}`})).error).toBeNull()
    const use=await owner.customer.rpc('record_vehicle_tax_year_total_miles',{p_vehicle_id:vehicle!.id,p_tax_year:2026,p_expected_event_id:null,p_total_miles_milli:20_000,p_request_key:`use-${randomUUID()}`})
    expect(use.error).toBeNull()
    const report=(await loadVehicleTaxYearReports(owner.customer,{businessId:owner.businessId,taxYear:2026}))[0]
    expect(report).toMatchObject({method:'standard_mileage',businessMilesMilli:10_000,totalMilesMilli:20_000,allocationBasisPoints:5_000,mileageDeductionCents:760})
    const changed=await owner.customer.rpc('record_vehicle_tax_year_method',{p_vehicle_id:vehicle!.id,p_tax_year:2026,p_expected_event_id:method.data,p_method:'actual_expenses',p_request_key:`method-change-${randomUUID()}`})
    expect(changed.error).toBeNull()
    const {data:history}=await owner.customer.from('vehicle_tax_year_method_events').select('method').eq('vehicle_id',vehicle!.id).order('created_at')
    expect(history?.map(row=>row.method)).toEqual(['standard_mileage','actual_expenses'])
    const crossTenant=await other.customer.rpc('record_vehicle_tax_year_method',{p_vehicle_id:vehicle!.id,p_tax_year:2026,p_expected_event_id:changed.data,p_method:'standard_mileage',p_request_key:`cross-${randomUUID()}`})
    expect(crossTenant.error).toBeTruthy()
    const mutate=await admin.from('vehicle_tax_year_method_events').update({method:'unresolved'}).eq('id',changed.data)
    expect(mutate.error?.message).toMatch(/append-only|permission denied/)
  })

  it('locks standard mileage across a lease period',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'leased-vehicle',amounts:[-300]})
    const {data:vehicle}=await owner.customer.from('business_vehicles').insert({business_id:owner.businessId,slot:1,display_name:'Leased SUV',is_mixed_use:true}).select().single()
    await owner.customer.rpc('record_vehicle_identity',{p_vehicle_id:vehicle!.id,p_expected_event_id:null,p_ownership:'leased',p_business_use_began_on:'2026-01-01',p_lease_started_on:'2026-01-01',p_lease_ended_on:'2028-12-31',p_request_key:`identity-${randomUUID()}`})
    const method=await owner.customer.rpc('record_vehicle_tax_year_method',{p_vehicle_id:vehicle!.id,p_tax_year:2026,p_expected_event_id:null,p_method:'standard_mileage',p_request_key:`method-${randomUUID()}`})
    const invalid=await owner.customer.rpc('record_vehicle_tax_year_method',{p_vehicle_id:vehicle!.id,p_tax_year:2026,p_expected_event_id:method.data,p_method:'actual_expenses',p_request_key:`switch-${randomUUID()}`})
    expect(invalid.error?.message).toMatch(/lease period/)
  })

  it('processes fuel through the autonomous worker without double counting standard mileage',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'vehicle-fuel',amounts:[-10_000]})
    const {data:transaction}=await owner.customer.from('financial_transactions').select('financial_account_id').eq('id',owner.transactionIds[0]).single()
    await owner.customer.rpc('set_financial_account_use',{p_financial_account_id:transaction!.financial_account_id,p_designation:'business_only',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:randomUUID()})
    const {data:vehicle}=await owner.customer.from('business_vehicles').insert({business_id:owner.businessId,slot:1,display_name:'Work truck',is_mixed_use:false}).select().single()
    await owner.customer.rpc('record_vehicle_identity',{p_vehicle_id:vehicle!.id,p_expected_event_id:null,p_ownership:'owned',p_business_use_began_on:'2026-01-01',p_lease_started_on:null,p_lease_ended_on:null,p_request_key:`identity-${randomUUID()}`})
    await owner.customer.rpc('record_vehicle_tax_year_method',{p_vehicle_id:vehicle!.id,p_tax_year:2026,p_expected_event_id:null,p_method:'standard_mileage',p_request_key:`method-${randomUUID()}`})
    await owner.customer.rpc('record_canonical_mileage',{p_id:randomUUID(),p_vehicle_id:vehicle!.id,p_miles_milli:10_000,p_occurred_on:'2026-08-05',p_job_label:null,p_destination:'Customer',p_business_purpose:'Customer visit',p_request_key:`trip-${randomUUID()}`})
    for(let pass=0;pass<40;pass+=1){await drainBookkeepingProcessingJobs({admin,batchSize:25});const{count}=await admin.from('bookkeeping_processing_jobs').select('id',{count:'exact',head:true}).eq('business_id',owner.businessId).in('state',['pending','retryable','processing']);if(!count)break}
    const {data:source}=await admin.from('bookkeeping_financial_sources').select('bookkeeping_record_id').eq('financial_transaction_id',owner.transactionIds[0]).is('revoked_at',null).single()
    const {data:association}=await owner.customer.from('current_vehicle_expense_associations').select('vehicle_id,expense_kind').eq('bookkeeping_record_id',source!.bookkeeping_record_id).single()
    expect(association).toEqual({vehicle_id:vehicle!.id,expense_kind:'fuel'})
    const {data:decisions}=await admin.from('bookkeeping_decisions').select('id,supersedes_decision_id').eq('bookkeeping_record_id',source!.bookkeeping_record_id)
    const superseded=new Set((decisions??[]).map(row=>row.supersedes_decision_id).filter(Boolean));const current=(decisions??[]).find(row=>!superseded.has(row.id))!
    const {data:allocation}=await admin.from('bookkeeping_allocations').select('id,tax_category_key').eq('bookkeeping_decision_id',current.id).eq('allocation_kind','business').single()
    expect(allocation?.tax_category_key).toBe('car-truck')
    const {data:treatment}=await admin.from('bookkeeping_tax_treatments').select('treatment_status,deductible_amount_cents').eq('bookkeeping_allocation_id',allocation!.id).order('created_at',{ascending:false}).limit(1).single()
    expect(treatment).toEqual({treatment_status:'not_deductible',deductible_amount_cents:0})
    const replay=await admin.rpc('request_bookkeeping_processing',{p_business_id:owner.businessId,p_bookkeeping_record_id:source!.bookkeeping_record_id,
      p_processing_reason:'vehicle_regression_replay',p_target_fingerprint:`vehicle-regression:${randomUUID()}`})
    expect(replay.error).toBeNull()
    expect(await drainBookkeepingProcessingJobs({admin,batchSize:1})).toMatchObject({completed:1,retried:0})
    const {count:treatmentCount}=await admin.from('bookkeeping_tax_treatments').select('id',{count:'exact',head:true}).eq('bookkeeping_allocation_id',allocation!.id)
    expect(treatmentCount).toBe(1)
    const report=await getAuthenticatedCanonicalReport({supabase:owner.customer,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
    expect(report).toMatchObject({mileageDeductionCents:760,estimatedDeductionsCents:760})
  })
})
