'use client'
import Link from 'next/link'
import { withReturnTo } from '../lib/navigation-context'
import { attachedReceiptLabel } from '../lib/bookkeeping/receipt-status-label'
import { purchaseReceiptEligible } from '../lib/bookkeeping/receipt-eligibility'
import { ReceiptUploadAction } from '../receipts/ReceiptUploadAction'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TransactionReadRow } from '../lib/bookkeeping/transaction-read-model'
import {canBulkReview} from '../lib/bookkeeping/guided-review-selection'
import type { WorkIndex, WorkView } from '../lib/bookkeeping/guided-review'

type Row=TransactionReadRow & {work:WorkIndex}
type Outcome={recordId:string;outcome:'recorded'|'needs_fact'|'documentation'|'removed'}
export function TransactionReview({rows,view,historical,returnTo='/transactions'}:{rows:Row[];view:WorkView;historical:boolean;returnTo?:string}) {
  const router=useRouter(),lock=useRef(false)
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [confirm,setConfirm]=useState<'remove_business'|'receipt_unavailable'|'reviewed'|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<Outcome[]|null>(null)
  const retry=useRef<{signature:string;id:string}|null>(null)
  const chosen=rows.filter(row=>selected.has(row.id))
  const canRemove=canBulkReview(chosen)
  const all=rows.length>0&&chosen.length===rows.length
  const canReceipt=canRemove&&chosen.every(row=>!row.has_receipt&&!row.receiptLost&&purchaseReceiptEligible(row))
  function toggle(id:string) { setConfirm(null);setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next}) }
  async function apply(action:NonNullable<typeof confirm>) {
    if(lock.current||!canRemove)return
    lock.current=true;setBusy(true);setError('')
    const items=chosen.map(row=>({recordId:row.recordId!,decisionId:row.currentDecisionId!})).sort((a,b)=>a.recordId.localeCompare(b.recordId))
    const scope=view==='receipts'?'receipts':historical?'historical':view==='receipt-only'?'all':view
    const signature=JSON.stringify({action,scope,items})
    if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    try {
      const response=await fetch('/api/bookkeeping/guided-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,scope,items,requestId:retry.current.id}),signal:AbortSignal.timeout(30000)})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error??'Your review could not be saved.')
      setResults(data.results);setSelected(new Set());setConfirm(null);retry.current=null;router.refresh()
    } catch(cause) {setError(cause instanceof Error?cause.message:'Your review could not be saved. Retry with the same selection.')} finally {lock.current=false;setBusy(false)}
  }
  const money=(row:Row)=>row.work.source_kind==='receipt_evidence'&&row.work.amount_cents==null?'Amount pending':new Intl.NumberFormat('en-US',{style:'currency',currency:row.currency}).format(row.amount)
  return <>
    {view==='receipts'&&<section className="guided-review-intro" aria-labelledby="receipt-review-heading"><h2 id="receipt-review-heading">Let’s find the receipts you don’t have.</h2><p>Select the purchases where you don’t have a receipt. Don’t select anything you still plan to upload.</p><p className="text-sm">This helps organize your records. It doesn’t mean every purchase legally requires a receipt.</p><ReceiptUploadAction variant="guided" label="Upload receipts" mobileLabel="Upload receipts" onComplete={()=>router.refresh()}/></section>}
    {historical&&view!=='receipts'&&<section className="guided-review-intro"><h2>See anything that wasn’t for the business?</h2><p>I organized these older purchases from your accounts. Select any personal or nonbusiness activity to remove it from your business books.</p><p className="text-sm">For a purchase that was partly business, open it to enter the business portion. You can also select purchases you’ve checked and mark this review done.</p></section>}
    {view==='receipt-only'&&<p className="my-5 text-[#59665f]">These purchases have receipt evidence without a matched bank transaction. They may be cash purchases, paid another way, or waiting for bank activity. Open a purchase to see its records. <Link href="/receipts" className="underline">See all receipts</Link></p>}
    {view==='review'&&<p className="my-5 text-[#59665f]">These purchases need a useful fact or correction. Open one to review it, or remove selected activity that wasn’t for your business.</p>}
    {results&&<section role="status" className="guided-review-result"><h2>Your review is saved.</h2>
      {results.some(r=>r.outcome==='removed')&&<p>{results.filter(r=>r.outcome==='removed').length} purchases removed from business. You can restore them from their transaction details.</p>}
      {results.some(r=>r.outcome==='recorded')&&<p>{results.filter(r=>r.outcome==='recorded').length} purchases recorded. I’ll keep the other information we have.</p>}
      {results.some(r=>r.outcome==='needs_fact')&&<p>I still need a useful fact for {results.filter(r=>r.outcome==='needs_fact').length} purchases. <Link href="/check-in" className="underline">Answer Betti’s questions</Link></p>}
      {results.some(r=>r.outcome==='documentation')&&<p>{results.filter(r=>r.outcome==='documentation').length} purchases still have documentation limits. I’ll keep them in your records with the information your tax preparer may need.</p>}
      <Link href="/home" className="inline-flex min-h-11 items-center font-semibold text-[#243186]">Return Home →</Link></section>}
    {rows.length>0&&<div className="review-select-heading"><label className="review-checkbox-label"><input type="checkbox" checked={all} ref={element=>{if(element)element.indeterminate=chosen.length>0&&!all}} disabled={busy} onChange={()=>{setConfirm(null);setSelected(all?new Set():new Set(rows.map(row=>row.id)))}}/>Select all on this page</label><span role="status" aria-live="polite">{chosen.length>0?`${chosen.length} selected`:''}</span></div>}
    {chosen.length>0&&<section className="review-bulk-actions" aria-label="Selected purchase actions"><p className="font-semibold" aria-live="polite">{chosen.length} selected on this page</p>
      {confirm?<><p>{confirm==='receipt_unavailable'?`You don’t have receipts for these ${chosen.length} purchases. I’ll record that fact and keep the other evidence we have.`:confirm==='reviewed'?`You’ve checked these ${chosen.length} purchases. This records your review without changing their bookkeeping or evidence.`:`Remove these ${chosen.length} purchases from your business? Their bank records and history will be kept.`}</p><div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy} onClick={()=>void apply(confirm)}>{busy?'Saving…':confirm==='receipt_unavailable'?'I don’t have these receipts':confirm==='reviewed'?'I’ve reviewed these purchases':'Remove from business'}</button><button className="btn btn-secondary" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button></div></>:<div className="flex flex-wrap gap-2">
        {canReceipt&&<button disabled={busy} className="btn btn-primary" onClick={()=>void apply('receipt_unavailable')}>{busy?'Saving…':'I don’t have these receipts'}</button>}
        {view!=='receipts'&&<button disabled={busy||!canRemove} className={`btn ${canReceipt?'btn-secondary':'btn-primary'}`} onClick={()=>setConfirm('remove_business')}>Remove from business</button>}
        {historical&&view!=='receipts'&&<button disabled={!canRemove} className="btn btn-secondary" onClick={()=>setConfirm('reviewed')}>Mark selected as reviewed</button>}
        <button disabled={busy} className="min-h-11 px-2 text-sm underline" onClick={()=>setSelected(new Set())}>Clear selection</button>
      </div>}
      {!canRemove&&<p>Some selected items need an individual review. Open those items to make changes.</p>}
      {error&&<p role="alert" className="text-red-700">{error}</p>}
    </section>}
    {!rows.length&&<p className="py-10 text-[#59665f]">No purchases in this view right now.</p>}
    <div className="record-list transaction-records">
      {rows.map(row=>{const secondary=row.has_receipt?attachedReceiptLabel(row):row.receiptLost?'Receipt unavailable':row.sourceLabel??(purchaseReceiptEligible(row)?'No receipt attached':null);return <div key={row.id} className={`review-transaction-row ${selected.has(row.id)?'is-selected':''}`}>
        <label className="review-row-select"><input type="checkbox" aria-label={`Select ${row.vendor}, ${row.date}, ${money(row)}`} checked={selected.has(row.id)} disabled={busy} onChange={()=>toggle(row.id)}/></label>
        <Link href={row.sourceKind==='receipt_evidence'?'/receipts':withReturnTo(`/transactions/${row.id}`,returnTo)} className="review-row-open" aria-label={`Open ${row.vendor}, ${row.date}, ${money(row)}`}>
          <div className="min-w-0"><p className="transaction-merchant">{row.vendor}</p><p className="mt-1 text-sm text-[#59665f]">{new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${row.date}T00:00:00Z`))} · {row.treatmentLabel}</p>{secondary&&<p className="mt-1 text-xs text-[#59665f]">{secondary}</p>}</div>
          <span className="transaction-amount">{money(row)}</span><span aria-hidden="true">›</span>
        </Link>
      </div>})}
    </div>
  </>
}
