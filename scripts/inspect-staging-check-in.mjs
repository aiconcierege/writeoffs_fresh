import { createClient } from '@supabase/supabase-js'
const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL
if(process.env.WRITEOFFS_ENVIRONMENT!=='staging'||new URL(url).hostname!=='sgrqrrxrlglhjuetdtps.supabase.co')throw Error('Staging only')
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
// Match the explicitly reported institution and fresh connection window. Do not enumerate identities.
const items=await admin.from('plaid_items').select('business_id,created_at').eq('institution_name','First Platypus Bank').eq('environment','sandbox').gte('created_at','2026-09-14T00:00:00Z').limit(2)
if(items.error||items.data?.length!==1){console.log(JSON.stringify({uniqueFreshConnection:false,count:items.data?.length}));process.exit(0)}
const businessId=items.data[0].business_id
const membership=await admin.from('business_memberships').select('authority,lifecycle').eq('business_id',businessId).single()
if(membership.data?.authority!=='stripe'||membership.data.lifecycle!=='active')throw Error('Fresh paid membership mismatch')
const transactions=await admin.from('financial_transactions').select('id,financial_account_id,transaction_date,raw_payload').eq('business_id',businessId).ilike('merchant_name','%Starbucks%').eq('amount_cents',-433).in('transaction_date',['2026-05-11','2026-06-10'])
if(transactions.error)throw Error('Target transaction lookup failed')
for(const t of transactions.data){
 const sources=await admin.from('bookkeeping_financial_sources').select('bookkeeping_record_id').eq('business_id',businessId).eq('financial_transaction_id',t.id).is('revoked_at',null)
 const use=await admin.from('current_financial_account_use').select('designation').eq('business_id',businessId).eq('financial_account_id',t.financial_account_id).maybeSingle()
 for(const source of sources.data??[]){
  const recordId=source.bookkeeping_record_id
  const [decisions,events,context,facts]=await Promise.all([
   admin.from('bookkeeping_decisions').select('id,supersedes_decision_id,provenance,bookkeeping_nature,treatment,business_purpose,review_status').eq('business_id',businessId).eq('bookkeeping_record_id',recordId),
   admin.from('bookkeeping_review_events').select('id,supersedes_event_id,event_type,question_context,answer_payload,resulting_decision_id,based_on_decision_id').eq('business_id',businessId).eq('bookkeeping_record_id',recordId).order('created_at'),
   admin.from('current_bookkeeping_business_context').select('id,assessment_state,assessment_basis,economic_context').eq('business_id',businessId).eq('bookkeeping_record_id',recordId),
   admin.from('current_bookkeeping_meal_substantiation_facts').select('id').eq('business_id',businessId).eq('bookkeeping_record_id',recordId)])
  const superseded=new Set(decisions.data?.map(d=>d.supersedes_decision_id)),current=decisions.data?.filter(d=>!superseded.has(d.id))??[]
  const supersededEvents=new Set(events.data?.map(e=>e.supersedes_event_id)),leaves=events.data?.filter(e=>!supersededEvents.has(e.id))??[]
  const tax=await admin.from('bookkeeping_tax_treatments').select('id,supersedes_tax_treatment_id,treatment_status,tax_category_key').eq('business_id',businessId).eq('bookkeeping_record_id',recordId)
  const supersededTax=new Set(tax.data?.map(t=>t.supersedes_tax_treatment_id))
  const historicalContextIds=leaves.map(e=>e.question_context?.businessContextAssessmentId).filter(Boolean)
  const historical=historicalContextIds.length?await admin.from('bookkeeping_business_context_assessments').select('assessment_state').eq('business_id',businessId).eq('bookkeeping_record_id',recordId).in('id',historicalContextIds):{data:[]}
  const category=t.raw_payload?.provider_evidence?.personal_finance_category
  const knownCategory=['FOOD_AND_DRINK','FOOD_AND_DRINK_COFFEE','FOOD_AND_DRINK_RESTAURANTS']
  console.log(JSON.stringify({targetDate:t.transaction_date,attachedHistoricalAssessmentEstablished:historical.data?.some(c=>c.assessment_state==='established'),taxTreatments:tax.data?.filter(t=>!supersededTax.has(t.id)).map(t=>({status:t.treatment_status,category:t.tax_category_key})),accountUse:use.data?.designation,category:{primary:knownCategory.includes(category?.primary)?category.primary:'other',detailed:knownCategory.includes(category?.detailed)?category.detailed:'other'},decisions:current.map(d=>({provenance:d.provenance,nature:d.bookkeeping_nature,treatment:d.treatment,reviewStatus:d.review_status,purposePresent:!!d.business_purpose})),context:context.data?.map(({assessment_state,assessment_basis,economic_context})=>({assessment_state,assessment_basis,economic_context})),mealFacts:facts.data?.length,events:events.data?.map(e=>({type:e.event_type,fact:e.question_context?.factType,contextBased:!!e.question_context?.businessContextAssessmentId,receiptBased:!!e.question_context?.receiptMealCandidateId,answerPresent:!!e.answer_payload,answerSelfOnly:typeof e.answer_payload?.answer==='string'&&/^(?:me|myself|just me|alone|no one|nobody|by myself)[.!]?$/i.test(e.answer_payload.answer.trim()),answerHasRepeatedWhitespace:typeof e.answer_payload?.answer==='string'&&/\s{2,}/.test(e.answer_payload.answer),attendeeExtracted:!!e.answer_payload?.attendeeRelationship,purposeExtracted:!!e.answer_payload?.businessPurpose})),currentEvents:leaves.map(e=>({type:e.event_type,fact:e.question_context?.factType,currentDecisionMatches:current.some(d=>d.id===e.based_on_decision_id),currentAssessmentMatches:context.data?.some(c=>c.id===e.question_context?.businessContextAssessmentId)}))}))
 }
}
