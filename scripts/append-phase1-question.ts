import {readFile} from 'node:fs/promises'
import {createClient,type SupabaseClient} from '@supabase/supabase-js'
import {SupabaseBookkeepingRepository} from '../app/lib/bookkeeping/supabase-repository'
import {CanonicalWeeklyReviewService} from '../app/lib/bookkeeping/review-events'
export async function appendPhase1Question(customer:SupabaseClient){
 const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL
 if(process.env.WRITEOFFS_ENVIRONMENT!=='staging'||!url||new URL(url).hostname!=='sgrqrrxrlglhjuetdtps.supabase.co')throw Error('Staging only')
 const fixture=JSON.parse(await readFile('/private/tmp/writeoffs-check-in-fixture.json','utf8'))
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 const identity=await admin.auth.admin.getUserById(fixture.userId)
 if(identity.data.user?.user_metadata.synthetic_check_in_validation!==true)throw Error('Synthetic fixture required')
 const owner=await admin.from('businesses').select('id').eq('id',fixture.businessId).eq('owner_user_id',fixture.userId).single()
 if(owner.error)throw Error('Fixture owner mismatch')
 const businessId=fixture.businessId,repository=new SupabaseBookkeepingRepository(admin)
 const record=await repository.ensureRecord({actor:{businessId,userId:null,provenance:'automation'},record:{sourceKind:'manual',financialTransactionId:null,ingestionKey:`phase1-growth:${crypto.randomUUID()}`,amountCents:-1250,currency:'USD',occurredOn:new Date().toISOString().slice(0,7)+'-02'}})
 const writer=new SupabaseBookkeepingRepository(customer)
 const initial=await writer.ensureInitialUnresolvedDecision(businessId,record.id)
 const decision=await writer.appendDecision({actor:{businessId,userId:fixture.userId,provenance:'user'},record,supersedesDecisionId:initial.id,decision:{bookkeepingNature:'expense',treatment:'business',reviewStatus:'needs_review',provenance:'user',reason:'Isolated synthetic background discovery fixture.',businessPurpose:null,allocations:[{kind:'business',amountCents:-1250,taxCategoryKey:'meals'}]}})
 const assessment=await admin.rpc('record_bookkeeping_business_context_assessment',{p_business_id:businessId,p_bookkeeping_record_id:record.id,p_assessment_state:'established',p_assessment_basis:'account_business_only',p_economic_context:'restaurant_meal',p_evaluator_version:'bookkeeping-business-context:v1',p_evidence_fingerprint:crypto.randomUUID().replaceAll('-','').repeat(2),p_evidence_references:[]})
 if(assessment.error)throw Error('Synthetic assessment failed')
 await new CanonicalWeeklyReviewService(repository).openIssue({businessId,recordId:record.id,decisionId:decision.id,reason:'BUSINESS_PURPOSE_NEEDED',issueKey:`phase1-growth:${crypto.randomUUID()}`,contextFingerprint:crypto.randomUUID(),questionContext:{schemaVersion:1,reason:'BUSINESS_PURPOSE_NEEDED',factType:'meal_attendee_relationship',businessContextAssessmentId:assessment.data}})
 console.log('Synthetic background question appended.')
}
