import {createClient} from '@supabase/supabase-js'
import {prepareCsvFinancialRows,ingestCsvFinancialActivity} from '../app/lib/bookkeeping/csv-ingestion'
import {drainBookkeepingProcessingJobs} from '../app/lib/bookkeeping/processing'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'
import {correctCanonicalTransactionUse} from '../app/lib/bookkeeping/transaction-corrections'

const url=process.env.SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY
const expected=process.env.WRITEOFFS_EXPECTED_SUPABASE_HOST??'sgrqrrxrlglhjuetdtps.supabase.co'
if(process.env.WRITEOFFS_ENVIRONMENT!=='staging'||!url||!anon||!service||new URL(url).hostname!==expected)throw new Error('Dedicated staging configuration required.')
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})

async function fixture(label:string,input:{ownership:'owned'|'leased';mixed:boolean;method:'standard_mileage'|'actual_expenses';descriptions:string[]}){
  const nonce=crypto.randomUUID(),email=`vehicle-${label}-${nonce}@staging.writeoffs.invalid`,password=`Vehicle-${nonce}-staging!`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_vehicle_validation:true}})
  if(created.error||!created.data.user)throw created.error??new Error('user unavailable')
  const customer=createClient(url!,anon!,{auth:{persistSession:false,autoRefreshToken:false}})
  const signed=await customer.auth.signInWithPassword({email,password});if(signed.error)throw signed.error
  const business=await admin.from('businesses').select('id').eq('owner_user_id',created.data.user.id).single();if(business.error)throw business.error
  const grant=await admin.rpc('create_business_membership_grant',{p_business_id:business.data.id,p_plan:'business',p_starts_at:'2026-01-01T00:00:00Z',p_ends_at:null,
    p_request_key:`vehicle-validation:${nonce}`,p_reason:'Synthetic staging vehicle validation.',p_provenance:'admin',p_actor_user_id:null});if(grant.error)throw grant.error
  const rows=prepareCsvFinancialRows({mapping:{date:'date',description:'description',amount:'amount'},rows:input.descriptions.map((description,index)=>({date:`2026-08-${String(index+10).padStart(2,'0')}`,description,amount:(-(100+index*25)).toFixed(2)}))}).rows
  await ingestCsvFinancialActivity({supabase:customer,rows})
  const account=await customer.from('financial_accounts').select('id').eq('business_id',business.data.id).eq('provider','csv').single();if(account.error)throw account.error
  const accountUse=await customer.rpc('set_financial_account_use',{p_financial_account_id:account.data.id,p_designation:'business_only',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:crypto.randomUUID()});if(accountUse.error)throw accountUse.error
  const vehicle=await customer.from('business_vehicles').insert({business_id:business.data.id,slot:1,display_name:`${label} vehicle`,is_mixed_use:input.mixed}).select().single();if(vehicle.error)throw vehicle.error
  const identity=await customer.rpc('record_vehicle_identity',{p_vehicle_id:vehicle.data.id,p_expected_event_id:null,p_ownership:input.ownership,p_business_use_began_on:'2026-01-01',p_lease_started_on:input.ownership==='leased'?'2026-01-01':null,p_lease_ended_on:input.ownership==='leased'?'2028-12-31':null,p_request_key:`identity:${nonce}`});if(identity.error)throw identity.error
  const method=await customer.rpc('record_vehicle_tax_year_method',{p_vehicle_id:vehicle.data.id,p_tax_year:2026,p_expected_event_id:null,p_method:input.method,p_request_key:`method:${nonce}`});if(method.error)throw method.error
  const trip=await customer.rpc('record_canonical_mileage',{p_id:crypto.randomUUID(),p_vehicle_id:vehicle.data.id,p_miles_milli:10_000_000,p_occurred_on:'2026-08-20',p_job_label:'Validation',p_destination:'Customer site',p_business_purpose:'Customer work',p_request_key:`trip:${nonce}`});if(trip.error)throw trip.error
  if(input.mixed){const use=await customer.rpc('record_vehicle_tax_year_total_miles',{p_vehicle_id:vehicle.data.id,p_tax_year:2026,p_expected_event_id:null,p_total_miles_milli:20_000_000,p_request_key:`use:${nonce}`});if(use.error)throw use.error}
  return{label,email,businessId:business.data.id,vehicleId:vehicle.data.id,customer}
}

async function drain(ids:string[]){for(let pass=0;pass<80;pass+=1){await drainBookkeepingProcessingJobs({admin,batchSize:25});const active=await admin.from('bookkeeping_processing_jobs').select('id',{head:true,count:'exact'}).in('business_id',ids).in('state',['pending','processing','retryable']);if(!active.count)return;await new Promise(resolve=>setTimeout(resolve,250))}throw new Error('Synthetic fixture queue did not drain.')}

async function inspect(item:Awaited<ReturnType<typeof fixture>>){
  const associations=await admin.from('current_vehicle_expense_associations').select('bookkeeping_record_id,expense_kind').eq('business_id',item.businessId)
  const treatments=await admin.from('bookkeeping_tax_treatments').select('bookkeeping_record_id,treatment_status,deductible_amount_cents,rule_key').eq('business_id',item.businessId)
  const assessment=await admin.from('current_vehicle_deduction_assessments').select('status,business_use_basis_points,mileage_deduction_cents,actual_expense_cents,deductible_actual_expense_cents,cpa_review_reasons').eq('business_id',item.businessId).single()
  const report=await getAuthenticatedCanonicalReport({supabase:item.customer,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
  return{label:item.label,businessId:item.businessId,vehicleId:item.vehicleId,associations:associations.data,treatments:treatments.data,assessment:assessment.data,
    report:{mileageDeductionCents:report.mileageDeductionCents,estimatedDeductionsCents:report.estimatedDeductionsCents,mileageTaxTreatmentStatus:report.mileageTaxTreatmentStatus}}
}
async function main(){
  const standard=await fixture('standard-owner',{ownership:'owned',mixed:false,method:'standard_mileage',descriptions:['Vehicle fuel','Parking fee','Vehicle purchase']})
  const actual=await fixture('actual-owner',{ownership:'owned',mixed:true,method:'actual_expenses',descriptions:['Vehicle fuel','Auto insurance','Auto repair']})
  const leased=await fixture('leased',{ownership:'leased',mixed:true,method:'actual_expenses',descriptions:['Vehicle lease payment']})
  await drain([standard.businessId,actual.businessId,leased.businessId])
  const beforeCorrection=await inspect(standard)
  const fuelRecord=beforeCorrection.associations?.find(row=>row.expense_kind==='fuel')?.bookkeeping_record_id
  if(!fuelRecord)throw new Error('standard fuel association missing')
  const decisionRows=await admin.from('bookkeeping_decisions').select('id,supersedes_decision_id').eq('business_id',standard.businessId).eq('bookkeeping_record_id',fuelRecord)
  const superseded=new Set((decisionRows.data??[]).map(row=>row.supersedes_decision_id).filter(Boolean));const current=(decisionRows.data??[]).find(row=>!superseded.has(row.id))
  const source=await admin.from('bookkeeping_financial_sources').select('financial_transaction_id').eq('bookkeeping_record_id',fuelRecord).is('revoked_at',null).single()
  await correctCanonicalTransactionUse({supabase:standard.customer,financialTransactionId:source.data!.financial_transaction_id,expectedCurrentDecisionId:current!.id,correctionRequestId:crypto.randomUUID(),answer:{schemaVersion:1,use:'personal'}})
  await drain([standard.businessId])
  const correctedDecisions=await admin.from('bookkeeping_decisions').select('id,supersedes_decision_id,treatment,provenance').eq('business_id',standard.businessId).eq('bookkeeping_record_id',fuelRecord)
  const correctedSuperseded=new Set((correctedDecisions.data??[]).map(row=>row.supersedes_decision_id).filter(Boolean));const correction=(correctedDecisions.data??[]).find(row=>!correctedSuperseded.has(row.id))
  console.log(JSON.stringify({standard:beforeCorrection,actual:await inspect(actual),leased:await inspect(leased),customerCorrection:correction,stagingPath:'/mileage'},null,2))
}
main().catch(error=>{console.error(error instanceof Error?error.message:error&&typeof error==='object'&&'message'in error?String(error.message):'Vehicle staging validation failed.');process.exitCode=1})
