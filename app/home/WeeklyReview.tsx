'use client'
import Link from 'next/link'
import {useState}from'react'
import type{CustomerWeeklyReview}from'../lib/bookkeeping/weekly-review'
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'})

export function WeeklyReview({review}:{review:CustomerWeeklyReview}){
 const[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('')
 async function action(value:'confirmed'|'deferred'){setBusy(true);setError('');const response=await fetch(`/api/bookkeeping/reviews/${review.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:value,expectedEventId:review.eventId,snapshotId:review.snapshotId,requestId:crypto.randomUUID()})});if(!response.ok){setError('This review changed. Refresh and take another look.');setBusy(false);return}setDone(true)}
 if(done)return <section className="mt-10 border-y border-[#cbd9d1] py-8"><h2 className="text-2xl font-semibold">Thanks — I’ve recorded your review.</h2><p className="mt-2 text-[#59665f]">WriteOffs will keep working in the background.</p></section>
 return <section className="mt-10 border-y border-[#cbd9d1] py-8" aria-labelledby="weekly-review-heading">
  <p className="eyebrow">Your weekly check-in</p><h2 id="weekly-review-heading" className="mt-3 text-3xl font-semibold tracking-[-.035em]">Here’s what I handled.</h2>
  <p className="mt-2 text-sm text-[#59665f]">{review.periodStart} through {review.periodEnd}</p>
  <dl className="mt-6 grid gap-3 sm:grid-cols-2">{review.scope==='business'&&<div><dt className="text-sm text-[#59665f]">Income</dt><dd className="money-display text-2xl font-semibold">{money.format((review.incomeCents??0)/100)}</dd></div>}<div><dt className="text-sm text-[#59665f]">Business expenses</dt><dd className="money-display text-2xl font-semibold">{money.format(review.expenseCents/100)}</dd></div></dl>
  <ul className="mt-6 divide-y divide-[#dce3de] border-y border-[#dce3de]">{review.items.map(item=><li key={item.id}><Link href={item.transactionId?`/transactions/${item.transactionId}?review=${review.id}&snapshot=${review.snapshotId}&event=${review.eventId}`:'/receipts'} className="flex min-h-16 items-center justify-between gap-4 py-3 text-sm"><span><span className="block font-semibold">{item.label}</span><span className="mt-0.5 block text-[#59665f]">{item.date} · {item.role==='income'?'Business income':item.treatment==='mixed_use'?'Business and personal':'Business expense'}</span></span><span className="shrink-0 font-semibold tabular-nums">{money.format(Math.abs(item.amountCents)/100)}</span></Link></li>)}</ul>
  <h3 className="mt-7 text-xl font-semibold">Anything you’d like to change?</h3>
  <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void action('confirmed')} className="btn btn-primary">Everything looks right</button><Link href="/transactions" className="btn btn-secondary">Make a change</Link><button disabled={busy} onClick={()=>void action('deferred')} className="btn btn-quiet">Not right now</button></div>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 </section>
}
