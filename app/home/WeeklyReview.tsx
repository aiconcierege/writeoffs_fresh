'use client'
import Link from 'next/link'
import {useState}from'react'
import type{CustomerWeeklyReview}from'../lib/bookkeeping/weekly-review'
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'})

export function WeeklyReview({review}:{review:CustomerWeeklyReview}){
 const[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('')
 async function action(value:'confirmed'|'deferred'){setBusy(true);setError('');const response=await fetch(`/api/bookkeeping/reviews/${review.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:value,expectedEventId:review.eventId,snapshotId:review.snapshotId,requestId:crypto.randomUUID()})});if(!response.ok){setError('This review changed. Refresh and take another look.');setBusy(false);return}setDone(true)}
 if(done)return <section className="home-review home-review-done"><span className="home-review-check">✓</span><div><h2>Thanks — I’ve recorded your review.</h2><p>WriteOffs will keep working in the background.</p></div></section>
 return <section className="home-review" aria-labelledby="weekly-review-heading">
  <div className="home-review-heading"><div><p className="home-kicker">Your weekly check-in</p><h2 id="weekly-review-heading">Here’s what I handled.</h2></div><p>{review.periodStart}<span aria-hidden="true"> — </span>{review.periodEnd}</p></div>
  <div className="home-review-sheet">
   <dl className="home-review-totals">{review.scope==='business'&&<div><dt>Income</dt><dd>{money.format((review.incomeCents??0)/100)}</dd></div>}<div><dt>Business expenses</dt><dd>{money.format(review.expenseCents/100)}</dd></div><div><dt>Activity handled</dt><dd>{review.items.length}</dd></div></dl>
   <ul className="home-review-items">{review.items.slice(0,5).map(item=><li key={item.id} data-kind={item.role==='income'?'income':item.treatment==='mixed_use'?'mixed':'expense'}><Link href={item.transactionId?`/transactions/${item.transactionId}?review=${review.id}&snapshot=${review.snapshotId}&event=${review.eventId}`:'/receipts'}><i aria-hidden="true">{item.role==='income'?'↓':item.treatment==='mixed_use'?'½':'✓'}</i><span><strong>{item.label}</strong><small>{item.date} · {item.role==='income'?'Business income':item.treatment==='mixed_use'?'Business and personal':'Business expense'}</small></span><b>{money.format(Math.abs(item.amountCents)/100)}</b></Link></li>)}</ul>
   {review.items.length>5&&<Link href="/transactions" className="home-review-more">See all {review.items.length} items <span aria-hidden="true">→</span></Link>}
  </div>
  <div className="home-review-footer"><div><h3>Anything you’d like to change?</h3><p>This confirms the review you see here—not each transaction one by one.</p></div><div className="home-review-actions"><button disabled={busy} onClick={()=>void action('confirmed')} className="btn btn-primary">Everything looks right</button><Link href="/transactions" className="btn btn-secondary">Make a change</Link><button disabled={busy} onClick={()=>void action('deferred')} className="btn btn-quiet">Not right now</button></div></div>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 </section>
}
