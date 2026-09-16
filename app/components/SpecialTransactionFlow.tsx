'use client'
import Link from 'next/link'
import {useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import type {SpecialWork} from '../lib/bookkeeping/special-transactions'
import {DocumentIntake} from '../documents/DocumentIntake'
import {returnLabel,safeReturnTo} from '../lib/navigation-context'
export function SpecialTransactionFlow({work,returnTo:origin}:{work:SpecialWork;returnTo:string}){
 const router=useRouter(),lock=useRef(false),request=useRef<{signature:string;id:string}|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[business,setBusiness]=useState(''),[selected,setSelected]=useState(''),[deferred,setDeferred]=useState(false),[none,setNone]=useState(false),[finished,setFinished]=useState(false)
 const returnTo=safeReturnTo(origin,'/home'),money=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Math.abs(c)/100)
 async function answer(action:string,original?:string,businessCents?:number){
  if(lock.current)return;lock.current=true;setBusy(true);setError('')
  const signature=JSON.stringify({expected:work.decisionId,action,original,businessCents})
  if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()}
  try{const r=await fetch(`/api/bookkeeping/records/${work.recordId}/special`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expected:work.decisionId,requestId:request.current.id,action,original,businessCents})});const data=await r.json();if(!r.ok)throw new Error(data.error??'Please try again.')
   if(action==='defer'){setDeferred(true);setMessage('I kept this on your list. Come back when you have the information.')}
   else{setMessage(action==='card_payment'?'Got it. This is a credit card payment, outside business income and expenses.':action==='owner_use'?'Got it. This is money taken or used personally, outside business expenses.':action==='refund_link'?'Got it. I linked this return to the purchase. Both records and their history are kept.':'Got it. I saved that fact.');if(['card_payment','owner_use','refund_link'].includes(action))setFinished(true);else router.refresh()}
  }catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{lock.current=false;setBusy(false)}
 }
 return <section className="mx-auto max-w-2xl space-y-4 py-5" aria-label="Betti transaction question">
  <Link href={returnTo} className="inline-flex min-h-11 items-center font-semibold">← {returnLabel(returnTo)}</Link><p className="font-semibold">Betti</p>
  {message&&<p role="status">{message}</p>}
  {!deferred&&!finished&&<>
  {work.kind==='movement'&&<><h1 className="text-2xl font-semibold">What kind of payment was this?</h1><div className="grid gap-3">{[['card_payment','Credit card payment'],['loan_payment','Payment on a business loan'],['owner_use','Money I took or used personally']].map(([action,label])=><button className="btn btn-secondary" disabled={busy} key={action} onClick={()=>void answer(action)}>{label}</button>)}<Link className="btn btn-secondary" href={`/check-in?record=${work.recordId}&ordinary=1&returnTo=${encodeURIComponent(returnTo)}`}>Something else</Link></div></>}
  {work.kind==='refund'&&!work.linked&&<><h1 className="text-2xl font-semibold">Was this money returned by a store, or did someone reimburse you?</h1><div className="flex flex-wrap gap-3"><button className="btn btn-secondary" disabled={busy} onClick={()=>void answer('merchant_return')}>Returned by the store</button><button className="btn btn-secondary" disabled={busy} onClick={()=>void answer('reimbursement')}>Someone reimbursed me</button></div>
   {work.lastAction==='reimbursement'?<><p>Send the expense and reimbursement records so Betti can establish what this repaid. No business income or expense reversal has been assumed.</p><DocumentIntake compact recordId={work.recordId}/></>:<><h2 className="text-lg font-semibold">Which purchase was returned?</h2><p>Confirm the original purchase. Betti won’t choose one for you.</p>{work.candidates.map(c=><label className="flex min-h-12 gap-3 rounded border p-3" key={c.recordId}><input type="radio" name="return-purchase" checked={selected===c.recordId} onChange={()=>{setSelected(c.recordId);setNone(false)}}/><span>{c.merchant} · {c.date} · {money(c.amountCents)}{c.crossYear&&<span className="block">Different tax year — needs tax-treatment review</span>}</span></label>)}
   {work.candidates.find(c=>c.recordId===selected)?.treatment==='mixed_use'&&<label className="block">How much of this return was for the business portion?<input className="field" inputMode="decimal" value={business} onChange={e=>setBusiness(e.target.value)}/></label>}
   <button disabled={busy||!selected} className="btn btn-primary" onClick={()=>{const mixed=work.candidates.find(c=>c.recordId===selected)?.treatment==='mixed_use';if(mixed&&!/^\d+(\.\d{1,2})?$/.test(business)){setError('Enter the business dollars from this return.');return}void answer('refund_link',selected,mixed?Math.round(Number(business)*100):undefined)}}>Yes, link this return</button>
   <button className="btn btn-secondary" onClick={()=>setNone(true)}>I don’t see it / something else</button>{none&&<><p>Send the original purchase or return record. I’ll keep this unresolved until the relationship is supported.</p><DocumentIntake compact recordId={work.recordId}/></>}</>}
  </>}
  {work.linked&&<><h1 className="text-2xl font-semibold">Refund linked</h1><p>This return reduces the supported business and personal portions of the original purchase. It is not business revenue.</p><button className="btn btn-secondary" disabled={busy} onClick={()=>void answer('refund_unlink')}>Change the original purchase</button></>}
  {work.kind==='loan'&&<><h1 className="text-2xl font-semibold">Send me the loan statement.</h1><p>I’ll separate the principal and interest when the statement supports them. The full payment won’t be counted as an expense.</p><DocumentIntake recordId={work.recordId}/></>}
  {!work.linked&&<button className="min-h-11 underline" disabled={busy} onClick={()=>void answer('defer')}>I’ll come back to this</button>}
  </>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  <Link href={returnTo} className="btn btn-secondary">{returnLabel(returnTo)}</Link>
 </section>
}
