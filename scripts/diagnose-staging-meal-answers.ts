import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { SupabaseBookkeepingRepository } from '../app/lib/bookkeeping/supabase-repository'
import { CanonicalWeeklyReviewService } from '../app/lib/bookkeeping/review-events'
import { understandMealAnswer } from '../app/lib/bookkeeping/meal-answer-understanding'
async function main(){
const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL
if(process.env.WRITEOFFS_ENVIRONMENT!=='staging'||!url||new URL(url).hostname!=='sgrqrrxrlglhjuetdtps.supabase.co')throw Error('Staging only')
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const nonce=crypto.randomUUID(),email=`check-in-proof-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_check_in_validation:true}})
if(created.error||!created.data.user)throw Error('Fixture creation failed')
const customer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}})
await customer.auth.signInWithPassword({email,password})
const b=await customer.from('businesses').select('id').eq('owner_user_id',created.data.user.id).single()
if(!b.data)throw Error('Fixture business missing')
const businessId=b.data.id
if(process.argv.includes('--browser-fixture')){
 const grant=await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:'2025-01-01T00:00:00Z',p_ends_at:null,p_request_key:`check-in:${nonce}`,p_reason:'Isolated Check-in browser certification',p_provenance:'admin',p_actor_user_id:null})
 if(grant.error)throw Error('Fixture membership failed')
 const setupState=await admin.from('business_customer_setup').insert({business_id:businessId,joined_month:new Date().toISOString().slice(0,7)+'-01',grandfathered_start_date:'2025-01-01',completed_at:new Date().toISOString(),timezone_name:'America/Phoenix'})
 if(setupState.error)throw Error('Fixture setup state failed')
 const setup=await admin.from('businesses').update({name:'Check-in Synthetic Studio',business_description:'Independent graphic design consulting',business_profile_context:'general',schedule_c_eligibility:'yes',business_stage:'existing',business_start_month:'2024-01-01',uses_customer_job_materials:'no',keeps_future_sale_merchandise:'no',catch_up_start_date:'2025-01-01',onboarding_start_method:'receipts',onboarding_state:'completed',onboarding_version:3,onboarding_completed_at:'2025-01-01T00:00:00Z'}).eq('id',businessId)
 if(setup.error)throw Error('Fixture setup failed')
 await writeFile('/private/tmp/writeoffs-check-in-fixture.json',JSON.stringify({businessId,userId:created.data.user.id,email,password}),{mode:0o600})
}
const trusted=new SupabaseBookkeepingRepository(admin),writer=new SupabaseBookkeepingRepository(customer)
for(const [label,text] of [['single-line','Jim Jones, client'],['multiple-lines','Jim Jones,\nclient'],['repeated-spaces','Jim Jones,  client']]){
 const record=await trusted.ensureRecord({actor:{businessId,userId:null,provenance:'automation'},record:{sourceKind:'manual',financialTransactionId:null,ingestionKey:`check-in-proof:${crypto.randomUUID()}`,amountCents:-433,currency:'USD',occurredOn:process.argv.includes('--browser-fixture')?new Date().toISOString().slice(0,7)+'-01':'2026-05-11'}})
 const initial=await writer.ensureInitialUnresolvedDecision(businessId,record.id)
 const decision=await writer.appendDecision({actor:{businessId,userId:created.data.user.id,provenance:'user'},record,supersedesDecisionId:initial.id,decision:{bookkeepingNature:'expense',treatment:'business',reviewStatus:'needs_review',provenance:'user',reason:'Isolated test fixture.',businessPurpose:null,allocations:[{kind:'business',amountCents:-433,taxCategoryKey:'meals'}]}})
 const assessment=await admin.rpc('record_bookkeeping_business_context_assessment',{p_business_id:businessId,p_bookkeeping_record_id:record.id,p_assessment_state:'established',p_assessment_basis:'account_business_only',p_economic_context:'restaurant_meal',p_evaluator_version:'bookkeeping-business-context:v1',p_evidence_fingerprint:nonce.replaceAll('-','').repeat(2),p_evidence_references:[]})
 if(assessment.error)throw Error('Fixture assessment failed')
 const event=await new CanonicalWeeklyReviewService(trusted).openIssue({businessId,recordId:record.id,decisionId:decision.id,reason:'BUSINESS_PURPOSE_NEEDED',issueKey:`check-in-proof:${crypto.randomUUID()}`,contextFingerprint:crypto.randomUUID(),questionContext:{schemaVersion:1,reason:'BUSINESS_PURPOSE_NEEDED',factType:'meal_attendee_relationship',businessContextAssessmentId:assessment.data}})
 if(process.argv.includes('--browser-fixture'))continue
 if(process.argv.includes('--refresh-assessment')){
  const refreshed=await admin.rpc('record_bookkeeping_business_context_assessment',{p_business_id:businessId,p_bookkeeping_record_id:record.id,p_assessment_state:'customer_authoritative',p_assessment_basis:'customer_correction',p_economic_context:'restaurant_meal',p_evaluator_version:'bookkeeping-business-context:v1',p_evidence_fingerprint:crypto.randomUUID().replaceAll('-','').repeat(2),p_evidence_references:[]})
  if(refreshed.error)throw Error('Synthetic worker assessment failed')
 }
 const u=understandMealAnswer(text)
 const result=await customer.rpc('answer_bookkeeping_business_context_meal_issue',{p_review_issue_id:event.reviewIssueId,p_expected_current_event_id:event.id,p_expected_current_decision_id:decision.id,p_expected_context_fingerprint:event.contextFingerprint,p_expected_evidence_fingerprint:event.evidenceFingerprint,p_answer:text,p_understanding_version:u.version,p_extracted_attendee_relationship:u.attendeeRelationship,p_extracted_business_purpose:u.businessPurpose})
 if(process.argv.includes('--expect-success'))assert.equal(result.status,200)
 const events=await customer.from('bookkeeping_review_events').select('event_type').eq('review_issue_id',event.reviewIssueId)
 if(process.argv.includes('--expect-success')){
  assert.equal(events.data?.filter(e=>e.event_type==='answered').length,1)
  assert.equal(events.data?.filter(e=>e.event_type==='resolved').length,1)
 }
 console.log(JSON.stringify({synthetic:true,label,status:result.status,invalidUnderstanding:result.error?.message==='invalid meal answer understanding',staleAssessment:result.error?.message==='business context changed',remainingFact:result.data?.remaining_fact_type,answerEvents:events.data?.filter(e=>e.event_type==='answered').length,resolvedEvents:events.data?.filter(e=>e.event_type==='resolved').length}))
}
await customer.auth.signOut()

}
main().catch(()=>{console.error("Synthetic meal diagnostic failed; details withheld.");process.exitCode=1})
