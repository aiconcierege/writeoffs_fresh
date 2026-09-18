import {requestUser} from '../lib/performance/request-identity'
import {timedRender} from '../lib/performance/request-timing'
import {redirect} from 'next/navigation'
import {createServerSupabase} from '../../utils/supabase/server'
import {loadCustomerEntitlements} from '../lib/membership/entitlements'
import {loadCurrentCustomerWork} from '../lib/bookkeeping/customer-work'
import {safeReturnTo} from '../lib/navigation-context'
import {SpecialTransactionFlow} from '../components/SpecialTransactionFlow'
import {loadSpecialWork} from '../lib/bookkeeping/special-transactions'
import {GuidedWork} from '../components/guided/GuidedWork'
import {ConversationShell} from '../components/guided/ConversationShell'
export const dynamic='force-dynamic'
async function CheckInPage({searchParams}:{searchParams:Promise<{record?:string;returnTo?:string;ordinary?:string;review?:string}>}){
 const db=await createServerSupabase(),{data:{user}}=await requestUser(db)
 if(!user)redirect('/login')
 const membership=await loadCustomerEntitlements(db)
 if(membership.lifecycle==='none')redirect('/membership')
 if(membership.lifecycle==='expired_read_only')redirect('/membership/read-only')
 const{record,returnTo:origin,ordinary,review}=await searchParams,returnTo=safeReturnTo(origin,'/home')
 const queue=await loadCurrentCustomerWork({supabase:db,scope:membership.plan??'expenses',recordId:record})
 // Explicit correction remains separate from the pending-work queue.
 if(review==='1'&&record){const special=await loadSpecialWork(db,record)
  if(special?.kind)return <ConversationShell returnTo={returnTo} context="Review this transaction"><SpecialTransactionFlow work={special} returnTo={returnTo} embedded/></ConversationShell>
 }
 return <GuidedWork initialWork={queue.work} returnTo={returnTo} recordId={record} ordinary={ordinary==='1'}/>
}

export default timedRender('CheckInPage',CheckInPage)
