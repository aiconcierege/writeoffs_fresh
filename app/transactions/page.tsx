import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import { AuthenticatedPage } from '../components/ui'
import { loadTransactionWork, WORK_VIEWS, type WorkView } from '../lib/bookkeeping/guided-review'
import { TransactionReview } from './TransactionReview'
export const dynamic='force-dynamic'
const labels:Record<WorkView,string>={all:'All',receipts:'Needs a receipt','receipt-only':'Receipt only',review:'Needs review'}
export default async function TransactionsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const supabase=await createServerSupabase(),{data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/login')
  const params=await searchParams
  const value=(key:string)=>typeof params[key]==='string'?(params[key] as string).slice(0,100):''
  const view=WORK_VIEWS.includes(value('view') as WorkView)?value('view') as WorkView:'all'
  const historical=value('scope')==='historical',query=value('q'),category=value('category'),account=value('account')
  const date=(key:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value(key))?value(key):undefined
  const offset=Math.max(0,Math.min(100000,Number.parseInt(value('offset')||'0',10)||0))
  const {data:categories}=await supabase.from('categories').select('key,label').order('label')
  const {data:accounts}=await supabase.from('financial_accounts').select('id,display_name').order('display_name')
  const {rows,hasMore}=await loadTransactionWork({supabase,userId:user.id,view,historical,offset,query,start:date('start'),end:date('end'),category,account})
  const href=(changes:Record<string,string>)=>{const next=new URLSearchParams();for(const key of ['view','scope','q','start','end','category','account'])if(value(key))next.set(key,value(key));for(const [key,val]of Object.entries(changes)){if(val)next.set(key,val);else next.delete(key)}return `/transactions?${next}`}
  return <AuthenticatedPage className="transactions-page premium-utility signature-page" eyebrow="Your activity" title={historical?'Review older purchases':'Transactions'} description="Your money in and out, organized in one place.">
    <div className="authenticated-toolbar">
    <nav aria-label="Transaction work views" className="transaction-work-views">{WORK_VIEWS.map(item=><Link key={item} href={href({view:item,scope:'',offset:''})} aria-current={view===item&&!historical?'page':undefined}>{labels[item]}</Link>)}</nav>
    <form className="transaction-filters"><input type="hidden" name="view" value={view}/>{historical&&<input type="hidden" name="scope" value="historical"/>}
      <div className="transaction-search-box"><label className="sr-only" htmlFor="transaction-search">Search transactions</label><input id="transaction-search" className="field" type="search" name="q" defaultValue={query} placeholder="Search transactions"/><button aria-label="Search transactions" className="transaction-search-submit"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></div>
      <details><summary className="inline-flex min-h-11 cursor-pointer items-center px-3 font-semibold text-[#243186]">Filters</summary><div className="grid gap-3 py-3 sm:grid-cols-2"><label>From<input className="field" type="date" name="start" defaultValue={date('start')}/></label><label>Through<input className="field" type="date" name="end" defaultValue={date('end')}/></label><label>Category<select className="field" name="category" defaultValue={category}><option value="">All categories</option>{(categories??[]).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Account<select className="field" name="account" defaultValue={account}><option value="">All accounts</option>{(accounts??[]).map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><button className="btn btn-secondary">Apply filters</button></div></details>
    </form>
    </div>
    <section className="authenticated-ledger" aria-label="Transaction list">
    <TransactionReview key={`${view}:${historical}:${offset}:${query}:${account}:${category}:${date('start')}:${date('end')}`} rows={rows} view={view} historical={historical} returnTo={href({offset:String(offset)})}/>
    </section>
    {(offset>0||hasMore)&&<nav aria-label="Transaction pages" className="my-6 flex justify-between gap-3">{offset>0?<Link href={href({offset:String(Math.max(0,offset-50))})} className="btn btn-secondary">Previous page</Link>:<span/>}{hasMore&&<Link href={href({offset:String(offset+50)})} className="btn btn-secondary">Next page</Link>}</nav>}
    <div className="mt-6 flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center font-semibold text-[#243186]" href="/settings/banking">Connect an account</Link><Link className="inline-flex min-h-11 items-center font-semibold text-[#243186]" href="/import">Upload a statement</Link></div>
    <p className="mt-5 text-sm text-[#59665f]">Selection applies only to this page. Open a purchase to change its business portion or see its history.</p>
  </AuthenticatedPage>
}
