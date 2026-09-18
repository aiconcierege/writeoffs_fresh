import Link from 'next/link'
import {redirect} from 'next/navigation'
import {createServerSupabase} from '../../utils/supabase/server'
import {loadCustomerEntitlements} from '../lib/membership/entitlements'
import {loadCurrentCustomerWork} from '../lib/bookkeeping/customer-work'
import {safeReturnTo,returnLabel} from '../lib/navigation-context'
import {StatementAccountUse} from '../components/StatementAccountUse'
import {SpecialTransactionFlow} from '../components/SpecialTransactionFlow'
import {loadSpecialWork} from '../lib/bookkeeping/special-transactions'
import {QuestionFlow} from '../questions/QuestionFlow'
import {WorkRefresh} from '../components/WorkRefresh'

export const dynamic='force-dynamic'
export default async function CheckInPage({searchParams}:{searchParams:Promise<{record?:string;returnTo?:string;ordinary?:string}>}){
 const db=await createServerSupabase(),{data:{user}}=await db.auth.getUser()
 if(!user)redirect('/login')
 const membership=await loadCustomerEntitlements(db)
 if(membership.lifecycle==='none')redirect('/membership')
 if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
 const {record,returnTo:origin,ordinary}=await searchParams,returnTo=safeReturnTo(origin,'/home')
 const queue=await loadCurrentCustomerWork({supabase:db,scope:membership.plan??'expenses',recordId:record})
 const next=queue.actions[0]
 if(next?.type==='account_use'){
  const {data:account,error}=await db.from('financial_accounts').select('id,display_name,mask_last_four').eq('id',next.target.id).single()
  if(error||!account)throw new Error('Account unavailable')
  return <main className="app-page" data-customer-action-count={queue.count}><WorkRefresh active/>
   <Link className="btn btn-secondary" href={returnTo}>← {returnLabel(returnTo)}</Link>
   <StatementAccountUse key={next.version} conversational accounts={[{id:account.id,displayName:account.display_name,mask:account.mask_last_four,designation:null}]}/></main>
 }
 const specialRecord=next?.recordIds[0]
 const special=specialRecord?await loadSpecialWork(db,specialRecord):null
 if(special?.kind&&!ordinary)return <main className="app-page" data-customer-action-count={queue.count}><SpecialTransactionFlow key={special.decisionId} work={special} returnTo={returnTo}/></main>
 return <div data-customer-action-count={queue.count}><QuestionFlow key={record??'betti'} returnTo={returnTo} initialQuestions={queue.questions}
  recordId={record} experience="check-in" initialWorkMessage={queue.home} initialActionCount={queue.count}/></div>
}
