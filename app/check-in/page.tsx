import {loadGuidedWorkSummary} from '../lib/bookkeeping/guided-review'
import {hasDeferredBookkeepingWork} from '../lib/onboarding/deferred-work'
import{redirect}from'next/navigation'
import{createServerSupabase}from'../../utils/supabase/server'
import{getCurrentAskableQuestionQueue}from'../lib/bookkeeping/customer-questions'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'
import{QuestionFlow}from'../questions/QuestionFlow'

export const dynamic='force-dynamic'

export default async function CheckInPage(){
  const supabase=await createServerSupabase()
  const{data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
  const queue=await getCurrentAskableQuestionQueue({supabase,scope:membership.plan??'expenses'})
  const deferred=membership.businessId?await hasDeferredBookkeepingWork(supabase,membership.businessId):false
  const work=await loadGuidedWorkSummary(supabase)
  return <QuestionFlow initialQuestions={queue.questions} experience="check-in" otherWorkWaiting={deferred||work.missingReceipts||work.historicalReview||work.documentationLimitations}/>
}
