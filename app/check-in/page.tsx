import Link from 'next/link'
import {hasDeferredBookkeepingWork} from '../lib/onboarding/deferred-work'
import {splitHistoricalQuestions,historicalReviewGroups} from '../lib/onboarding/historical-review'
import{redirect}from'next/navigation'
import{createServerSupabase}from'../../utils/supabase/server'
import{getCurrentAskableQuestionQueue}from'../lib/bookkeeping/customer-questions'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'
import{QuestionFlow}from'../questions/QuestionFlow'

export const dynamic='force-dynamic'

export default async function CheckInPage({searchParams}:{searchParams:Promise<{scope?:string}>}){
  const supabase=await createServerSupabase()
  const{data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
  const queue=await getCurrentAskableQuestionQueue({supabase,scope:membership.plan??'expenses'})
  const {data:setup}=await supabase.from('business_customer_setup').select('joined_month').maybeSingle()
  const ongoingFrom=setup?.joined_month??new Date().toISOString().slice(0,7)+'-01'
  const {historical,ongoing}=splitHistoricalQuestions(queue.questions,ongoingFrom)
  const deferred=membership.businessId?await hasDeferredBookkeepingWork(supabase,membership.businessId):false
  const params=await searchParams
  const HistoricalHeading=ongoing.length>0?'h2':'h1'
  if(params.scope==='historical')return <QuestionFlow initialQuestions={historical} range={{start:'1900-01-01',end:new Date(Date.parse(`${ongoingFrom}T00:00:00Z`)-86400000).toISOString().slice(0,10)}} experience="check-in" otherWorkWaiting={ongoing.length>0||deferred}/>
  return <>
    {(ongoing.length>0||historical.length===0)&&<QuestionFlow initialQuestions={ongoing} experience="check-in" ongoingFrom={ongoingFrom} otherWorkWaiting={historical.length>0||deferred}/>}
    {historical.length>0&&<section className="mx-auto max-w-2xl border-b border-[#dce3de] py-8" aria-labelledby="historical-heading">{ongoing.length===0&&<Link href="/home" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">← Home</Link>}<HistoricalHeading id="historical-heading" className="mt-4 text-2xl font-semibold tracking-tight">Let’s work through your earlier records.</HistoricalHeading><p className="mt-4 leading-7 text-[#59665f]">I’ve organized what I can from your records. Start by checking for personal purchases, then we can look at the facts still needed.</p><Link href="/transactions" className="btn btn-primary mt-6">Review historical purchases</Link><p className="mt-4 text-sm leading-6 text-[#59665f]">Older meals may be missing details about who was there or the business purpose. Keep the records you have; don’t guess. These items stay on your list until the facts are clear.</p><details className="mt-5"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[#243186]">See what’s waiting in your earlier records</summary><ul className="mt-3 divide-y divide-[#dce3de]">{historicalReviewGroups(historical).map(group=><li key={group.merchant} className="flex justify-between gap-4 py-3 text-sm"><span>{group.merchant}</span><span>{group.count} {group.count===1?'item':'items'}</span></li>)}</ul><Link href="/check-in?scope=historical" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">Review individual questions when you have the facts</Link></details></section>}

  </>

}
