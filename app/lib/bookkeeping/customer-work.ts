import {requestUser} from '../performance/request-identity'
import {loadCustomerEntitlements} from '../membership/entitlements'
import type { SupabaseClient } from '@supabase/supabase-js'
import { homeCommand } from '../home/command-center'
import { loadBettiWork } from './betti-work-loader'

/** All conversational consumers share the same scope, prerequisites and waiting gates.
 * `count` includes canonical guided actions; `questions` is only the question subset. */
export async function loadCurrentCustomerWork(input:{supabase:SupabaseClient;scope?:'business'|'expenses';asOf?:string;recordId?:string}) {
  const {data:{user}}=await requestUser(input.supabase)
  if(!user)throw new Error('Authenticated user required')
  const {data:business,error}=await input.supabase.from('businesses').select('id,onboarding_start_method').eq('owner_user_id',user.id).single()
  if(error||!business)throw new Error('Business unavailable')
  const scope=input.scope??(await loadCustomerEntitlements(input.supabase)).plan??'expenses'
  const work=await loadBettiWork({db:input.supabase,businessId:business.id,scope,asOf:input.asOf,
    continuityRecordId:input.recordId,processingEnabled:process.env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED!=='false'})
  const actions=work.customer.actionable.filter(a=>!input.recordId||a.recordIds.includes(input.recordId))
  const questions=actions.flatMap(a=>a.question?[a.question]:[])
  const dates=questions.flatMap(q=>q.openedAt?[q.openedAt]:[]).sort()
  return {asOf:work.asOf,count:work.customer.actionableCount,oldestOutstandingAt:dates[0]??null,questions,actions,work,home:homeCommand(work,business.onboarding_start_method)}
}
