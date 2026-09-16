import {loadSpecialWork} from '../lib/bookkeeping/special-transactions'
import {SpecialTransactionFlow} from '../components/SpecialTransactionFlow'
import Link from 'next/link'
import { safeReturnTo, returnLabel } from '../lib/navigation-context'
import { StatementAccountUse } from '../components/StatementAccountUse'
import { loadStatementAccountUse } from '../lib/bookkeeping/statement-account-use'
import {loadGuidedWorkSummary} from '../lib/bookkeeping/guided-review'
import {hasDeferredBookkeepingWork} from '../lib/onboarding/deferred-work'
import{redirect}from'next/navigation'
import{createServerSupabase}from'../../utils/supabase/server'
import{getCurrentAskableQuestionQueue}from'../lib/bookkeeping/customer-questions'
import{loadCustomerEntitlements}from'../lib/membership/entitlements'
import{QuestionFlow}from'../questions/QuestionFlow'

export const dynamic='force-dynamic'

export default async function CheckInPage({searchParams}:{searchParams:Promise<{record?:string;returnTo?:string;ordinary?:string}>}){
  const supabase=await createServerSupabase()
  const{data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/login')
  const membership=await loadCustomerEntitlements(supabase)
  if(membership.lifecycle==='none')redirect('/membership')
  if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
  const queue=await getCurrentAskableQuestionQueue({supabase,scope:membership.plan??'expenses'})
  const deferred=membership.businessId?await hasDeferredBookkeepingWork(supabase,membership.businessId):false
  const work=await loadGuidedWorkSummary(supabase)
  const {record,returnTo:origin,ordinary}=await searchParams
  const returnTo=safeReturnTo(origin,'/home')
  const scoped=record?queue.questions.filter(question=>question.recordId===record):queue.questions
  const statementAccounts = await loadStatementAccountUse(supabase, true)
  const {data:context}=record?await supabase.from('customer_transaction_work').select('account_id').eq('record_id',record).maybeSingle():{data:null}
  const applicable=record?statementAccounts.filter(account=>account.id===context?.account_id):statementAccounts
  if(applicable.length)return <main className="app-page"><Link className="btn btn-secondary" href={returnTo}>← {returnLabel(returnTo)}</Link><StatementAccountUse conversational accounts={applicable}/></main>
  const specialRecord=record??scoped[0]?.recordId
  const special=specialRecord?await loadSpecialWork(supabase,specialRecord):null
  if(special?.kind&&!ordinary)return <main className="app-page"><SpecialTransactionFlow key={special.decisionId} work={special} returnTo={returnTo}/></main>
  return <QuestionFlow key={queue.questions.map(q=>q.version).join(':')} returnTo={returnTo} initialQuestions={scoped} recordId={record} experience="check-in" otherWorkWaiting={deferred||work.missingReceipts||work.historicalReview||work.documentationLimitations}/>
}
