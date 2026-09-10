import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { SupabaseBookkeepingRepository } from '../../app/lib/bookkeeping/supabase-repository'
import { CanonicalWeeklyReviewService } from '../../app/lib/bookkeeping/review-events'
import { understandMealAnswer } from '../../app/lib/bookkeeping/meal-answer-understanding'

const url=process.env.LOCAL_SUPABASE_URL,anon=process.env.LOCAL_SUPABASE_ANON_KEY,service=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const run=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anon&&service)
const client=(key:string)=>createClient(url!,key,{auth:{persistSession:false,autoRefreshToken:false}})

async function fixture(admin:SupabaseClient,label:string){
  const password='local-meal-answer-password'
  const created=await admin.auth.admin.createUser({email:`meal-${label}-${crypto.randomUUID()}@example.test`,password,email_confirm:true})
  if(created.error||!created.data.user)throw created.error
  const customer=client(anon!);const signed=await customer.auth.signInWithPassword({email:created.data.user.email!,password})
  if(signed.error)throw signed.error
  const business=await admin.from('businesses').select('id').eq('owner_user_id',created.data.user.id).single()
  if(business.error)throw business.error
  const trusted=new SupabaseBookkeepingRepository(admin),writer=new SupabaseBookkeepingRepository(customer)
  const record=await trusted.ensureRecord({actor:{businessId:business.data.id,userId:null,provenance:'automation'},record:{
    sourceKind:'manual',financialTransactionId:null,ingestionKey:`meal-reassessment:${crypto.randomUUID()}`,
    amountCents:-18642,currency:'USD',occurredOn:'2026-09-01'}})
  const initial=await writer.ensureInitialUnresolvedDecision(business.data.id,record.id)
  const decision=await writer.appendDecision({actor:{businessId:business.data.id,userId:created.data.user.id,provenance:'user'},
    record,supersedesDecisionId:initial.id,decision:{bookkeepingNature:'expense',treatment:'business',reviewStatus:'needs_review',provenance:'user',
      reason:'Customer established business meal use.',businessPurpose:null,
      allocations:[{kind:'business',amountCents:-18642}]}})
  const hash=crypto.randomUUID().replaceAll('-','').padEnd(64,'0').slice(0,64)
  const receiptId=crypto.randomUUID(),storagePath=`receipts/${created.data.user.id}/${hash}`
  const receipt=await customer.rpc('register_bookkeeping_receipt',{p_receipt_id:receiptId,p_upload_fingerprint:hash,
    p_storage_path:storagePath,p_original_name:'meal.png',p_mime_type:'image/png',p_bytes:10})
  if(receipt.error)throw receipt.error
  const candidate=await admin.rpc('worker_record_receipt_meal_candidate',{p_business_id:business.data.id,p_receipt_id:receipt.data.id,
    p_document_sha256:hash,p_support_kind:'explicit_restaurant_context',p_evidence:[{kind:'merchant'}],p_processor_version:'test:v1'})
  if(candidate.error)throw candidate.error
  const event=await new CanonicalWeeklyReviewService(trusted).openIssue({businessId:business.data.id,recordId:record.id,
    decisionId:decision.id,reason:'BUSINESS_PURPOSE_NEEDED',issueKey:`meal-attendee:${crypto.randomUUID()}`,
    contextFingerprint:`meal-attendee:${crypto.randomUUID()}`,questionContext:{schemaVersion:1,reason:'BUSINESS_PURPOSE_NEEDED',
      factType:'meal_attendee_relationship',receiptMealCandidateId:candidate.data}})
  return{customer,businessId:business.data.id,recordId:record.id,decision,event}
}

async function answer(f:Awaited<ReturnType<typeof fixture>>,text:string){
  const understood=understandMealAnswer(text)
  const result=await f.customer.rpc('answer_bookkeeping_meal_substantiation_issue_v2',{
    p_review_issue_id:f.event.reviewIssueId,p_expected_current_event_id:f.event.id,
    p_expected_current_decision_id:f.decision.id,p_expected_context_fingerprint:f.event.contextFingerprint,
    p_expected_evidence_fingerprint:f.event.evidenceFingerprint!,p_attendee_relationship:text,
    p_understanding_version:understood.version,p_extracted_attendee_relationship:understood.attendeeRelationship,
    p_extracted_business_purpose:understood.businessPurpose})
  if(result.error)throw result.error
  return result.data as Record<string,unknown>
}

describe.skipIf(!run)('meal answer reassessment on local Supabase',()=>{
  it('completes when one answer establishes attendee and purpose',async()=>{
    const admin=client(service!),f=await fixture(admin,'both'),result=await answer(f,'Met with Jim Jones to discuss Kool Aide project')
    expect(result.remaining_fact_type).toBeNull();expect(result.follow_up_event_id).toBeNull()
    const decision=await admin.from('bookkeeping_decisions').select('business_purpose,review_status').eq('id',result.decision_id).single()
    expect(decision.data).toMatchObject({business_purpose:'to discuss Kool Aide project',review_status:'resolved'})
  })
  it('asks for purpose when only attendee relationship is established',async()=>{
    const admin=client(service!),f=await fixture(admin,'attendee'),result=await answer(f,'Jim Jones, client')
    expect(result.remaining_fact_type).toBe('receipt_meal_business_purpose');expect(result.follow_up_event_id).toBeTruthy()
  })
  it('asks for attendee when only purpose is established',async()=>{
    const admin=client(service!),f=await fixture(admin,'purpose'),result=await answer(f,'Discussed Kool Aide project')
    expect(result.remaining_fact_type).toBe('meal_attendee_relationship');expect(result.follow_up_event_id).toBeTruthy()
  })
  it('does not promote an ambiguous answer into either fact',async()=>{
    const admin=client(service!),f=await fixture(admin,'ambiguous'),result=await answer(f,'Business meeting')
    expect(result.remaining_fact_type).toBe('meal_attendee_relationship')
    const facts=await admin.from('current_bookkeeping_meal_substantiation_facts').select('id').eq('bookkeeping_record_id',f.recordId)
    expect(facts.data).toEqual([])
  })
})
