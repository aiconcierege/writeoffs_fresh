import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'
import { loadMileageTotal } from '../../app/lib/mileage/repository'

const url=process.env.LOCAL_SUPABASE_URL;const anonKey=process.env.LOCAL_SUPABASE_ANON_KEY;const serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anonKey&&serviceKey)
const suite=enabled?describe.sequential:describe.skip
suite('canonical mileage against local PostgreSQL',()=>{
  it('records, corrects, totals, voids, isolates, and preserves append-only history',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'mileage-owner',amounts:[-100]})
    const other=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'mileage-other',amounts:[-200]})
    const {data:vehicle,error:vehicleError}=await owner.customer.from('business_vehicles').insert({business_id:owner.businessId,slot:1,display_name:'Work car',is_mixed_use:true}).select().single()
    expect(vehicleError).toBeNull()
    const entryId=randomUUID();const requestKey=`mileage-${randomUUID()}`
    const args={p_id:entryId,p_vehicle_id:vehicle!.id,p_miles_milli:12500,p_occurred_on:'2026-08-20',p_job_label:'Project A',p_destination:'Customer site',p_business_purpose:'Customer meeting',p_request_key:requestKey}
    const first=await owner.customer.rpc('record_canonical_mileage',args);const retry=await owner.customer.rpc('record_canonical_mileage',{...args,p_id:randomUUID()})
    expect(first).toMatchObject({data:entryId,error:null});expect(retry.data).toBe(entryId)
    const {data:leaf}=await owner.customer.from('current_canonical_mileage_entries').select('*').eq('id',entryId).single()
    const correction=await owner.customer.rpc('correct_canonical_mileage',{p_mileage_entry_id:entryId,p_expected_event_id:leaf!.current_event_id,p_vehicle_id:vehicle!.id,p_miles_milli:13000,p_occurred_on:'2026-08-20',p_job_label:'Project A',p_destination:'Customer site',p_business_purpose:'Customer meeting and estimate',p_request_key:`correct-${randomUUID()}`,p_reason:'Corrected miles'})
    expect(correction.error).toBeNull()
    const stale=await owner.customer.rpc('correct_canonical_mileage',{p_mileage_entry_id:entryId,p_expected_event_id:leaf!.current_event_id,p_vehicle_id:vehicle!.id,p_miles_milli:14000,p_occurred_on:'2026-08-20',p_job_label:null,p_destination:null,p_business_purpose:null,p_request_key:`stale-${randomUUID()}`,p_reason:'Stale'})
    expect(stale.error).toBeTruthy()
    const {data:current}=await owner.customer.from('current_canonical_mileage_entries').select('*').eq('id',entryId).single()
    expect(current).toMatchObject({miles_milli:13000,job_label:'Project A'})
    expect(await loadMileageTotal(owner.customer,{businessId:owner.businessId,start:'2026-01-01',end:'2026-12-31'})).toBe(13000)
    const crossTenant=await other.customer.rpc('void_canonical_mileage',{p_mileage_entry_id:entryId,p_expected_event_id:current!.current_event_id,p_request_key:`cross-${randomUUID()}`,p_reason:'Forbidden'})
    expect(crossTenant.error).toBeTruthy()
    const mutation=await admin.from('canonical_mileage_entries').update({original_miles_milli:1}).eq('id',entryId)
    expect(mutation.error?.message).toMatch(/append-only|permission denied/)
    const removed=await owner.customer.rpc('void_canonical_mileage',{p_mileage_entry_id:entryId,p_expected_event_id:current!.current_event_id,p_request_key:`void-${randomUUID()}`,p_reason:'Duplicate trip'})
    expect(removed.error).toBeNull()
    const {count}=await owner.customer.from('current_canonical_mileage_entries').select('*',{count:'exact',head:true}).eq('id',entryId)
    expect(count).toBe(0)
    const {data:history}=await owner.customer.from('canonical_mileage_events').select('event_type').eq('mileage_entry_id',entryId).order('sequence_number')
    expect(history?.map((event)=>event.event_type)).toEqual(['recorded','corrected','voided'])
    const legacy=await owner.customer.from('mileage_trips').select('id').limit(1);expect(legacy.error).toBeTruthy()
  })
})
