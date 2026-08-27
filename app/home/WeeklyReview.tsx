'use client'
import Link from'next/link'
import{useMemo,useState}from'react'
import{useRouter}from'next/navigation'
import type{CustomerWeeklyReview,WeeklyReviewStage,WeeklyReviewTransaction}from'../lib/bookkeeping/weekly-review'
import{formatReviewActivityDate,formatReviewPeriod,reviewTreatmentLabel}from'../lib/bookkeeping/weekly-review-presentation'
import{ReceiptUploadAction}from'../receipts/ReceiptUploadAction'
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'})
const stageCopy:Record<WeeklyReviewStage,{kicker:string;title:string}>={personal:{kicker:'First, the exceptions',title:'Which of these were personal?'},mixed:{kicker:'Next, shared purchases',title:'Did any include business and personal spending?'},questions:{kicker:'A few facts only you know',title:'Now I can finish the bookkeeping.'},documentation:{kicker:'Receipts and records',title:'Let’s finish the documentation check.'},mileage:{kicker:'Business driving',title:'What about mileage this week?'},final:{kicker:'Your cleaned books',title:'I’m preparing the final review.'}}

function TransactionRow({item,selectable,selected,onSelect,children}:{item:WeeklyReviewTransaction;selectable?:boolean;selected?:boolean;onSelect?:()=>void;children?:React.ReactNode}){
 const router=useRouter()
 const category=item.categoryLabel?` · ${item.categoryLabel}`:''
 const treatment=item.treatment==='mixed_use'?'Business + personal':item.treatment==='personal'?'Personal':item.treatment==='business'?'Business':'Still being worked on'
 return <li className={`weekly-transaction-row${selected?' is-selected':''}`}><label>
  {selectable&&<input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${item.merchant}`}/>}<span className="weekly-transaction-main"><strong>{item.merchant}</strong><span className="weekly-transaction-meta"><time dateTime={item.date}>{formatReviewActivityDate(item.date)}</time>{category} · {treatment}</span><span className={`weekly-receipt-state ${item.hasReceipt?'has-receipt':'missing-receipt'}`}>{item.hasReceipt?'Receipt attached':'No receipt'}</span></span><b>{money.format(Math.abs(item.amountCents)/100)}</b>
 </label>{!item.hasReceipt&&item.amountCents<0&&<div className="weekly-row-receipt"><ReceiptUploadAction variant="home" intendedTransactionId={item.id} onComplete={()=>router.refresh()}/></div>}{children}</li>
}

function WorkflowReview({review,currentQuestionCount}:{review:CustomerWeeklyReview;currentQuestionCount:number}){
 const router=useRouter()
 const[stage,setStage]=useState(review.workflowStage),[eventId,setEventId]=useState(review.workflowEventId)
 const[selected,setSelected]=useState(new Set<string>()),[amounts,setAmounts]=useState<Record<string,string>>({})
 const[individualDocumentation,setIndividualDocumentation]=useState(false),[resolvedDocumentation,setResolvedDocumentation]=useState(new Set<string>())
 const[personalIds,setPersonalIds]=useState(new Set(review.transactions.filter(item=>item.treatment==='personal').map(item=>item.id)))
 const[busy,setBusy]=useState(false),[error,setError]=useState('')
 const visible=useMemo(()=>review.transactions.filter(item=>!personalIds.has(item.id)),[review.transactions,personalIds])
 const missing=visible.filter(item=>item.amountCents<0&&!item.hasReceipt&&!item.receiptLost&&!resolvedDocumentation.has(item.recordId))
 function toggle(id:string){setSelected(value=>{const next=new Set(value);if(next.has(id))next.delete(id);else next.add(id);return next})}
 async function advance(documentationDecision?:'include_missing'|'exclude_missing'|'no_missing'){setBusy(true);setError('')
  const changes:Array<Record<string,unknown>>=stage==='personal'?review.transactions.filter(item=>selected.has(item.id)).map(item=>({transactionId:item.id,decisionId:item.currentDecisionId,use:'personal'}))
   :stage==='mixed'?visible.filter(item=>selected.has(item.id)).map(item=>({transactionId:item.id,decisionId:item.currentDecisionId,use:'mixed',totalAmountCents:item.amountCents,businessAmountCents:parseDollars(amounts[item.id]??'')})):[]
  if(stage==='mixed'&&changes.some(change=>change.businessAmountCents==null)){setError('Enter the business dollar amount for each selected purchase.');setBusy(false);return}
  const response=await fetch(`/api/bookkeeping/reviews/${review.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage,expectedEventId:eventId,requestId:crypto.randomUUID(),changes,
   ...(stage==='documentation'?{documentationDecision:documentationDecision??'no_missing',recordIds:missing.map(item=>item.recordId)}:{})})})
  const result=await response.json().catch(()=>({})) as{error?:string;eventId?:string}
  if(!response.ok){setError(result.error??'This review changed. Refresh and try again.');setBusy(false);return}
  if(stage==='personal')setPersonalIds(value=>new Set([...value,...selected]))
  setEventId(result.eventId??null);setSelected(new Set());setAmounts({});setStage(nextStage(stage));setBusy(false);router.refresh()
 }
 async function decideOne(item:WeeklyReviewTransaction,decision:'include_missing'|'exclude_missing'){
  setBusy(true);setError('')
  const response=await fetch(`/api/bookkeeping/reviews/${review.id}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage:'documentation',expectedEventId:eventId,requestId:crypto.randomUUID(),documentationDecision:decision,recordIds:[item.recordId],completeStage:false})})
  const result=await response.json().catch(()=>({})) as{error?:string}
  if(!response.ok){setError(result.error??'This documentation choice could not be saved.');setBusy(false);return}
  setResolvedDocumentation(value=>new Set([...value,item.recordId]));setBusy(false);router.refresh()
 }
 const copy=stageCopy[stage]
 return <section className="home-review weekly-workflow" aria-labelledby="weekly-review-heading"><header className="home-review-heading"><div><p className="home-kicker">Your weekly check-in</p><p className="home-review-period">{formatReviewPeriod(review.periodStart,review.periodEnd)}</p><h2 id="weekly-review-heading">{copy.title}</h2><p>{copy.kicker}</p></div></header>
  <div className="weekly-workflow-body">
   {stage==='personal'&&<><p className="weekly-workflow-guidance">Select only the transactions that were entirely personal. You don’t need to confirm every business purchase.</p><ul className="weekly-transaction-list">{review.transactions.map(item=><TransactionRow key={item.id} item={item} selectable selected={selected.has(item.id)} onSelect={()=>toggle(item.id)}/>)}</ul></>}
   {stage==='mixed'&&<><p className="weekly-workflow-guidance">Select any purchase that included both. Then enter the business dollars—WriteOffs will calculate the allocation.</p><ul className="weekly-transaction-list">{visible.filter(item=>item.amountCents<0).map(item=><TransactionRow key={item.id} item={item} selectable selected={selected.has(item.id)} onSelect={()=>toggle(item.id)}>{selected.has(item.id)&&<label className="weekly-business-amount">Business amount <span><span aria-hidden="true">$</span><input inputMode="decimal" value={amounts[item.id]??''} onChange={event=>setAmounts(value=>({...value,[item.id]:event.target.value}))} placeholder="0.00"/></span></label>}</TransactionRow>)}</ul></>}
   {stage==='questions'&&<div className="weekly-stage-message"><p>{currentQuestionCount?`I have ${currentQuestionCount} ${currentQuestionCount===1?'question':'questions'} about this week’s activity.`:'No current-week questions are waiting.'}</p>{currentQuestionCount>0&&<Link className="btn btn-primary" href={`/questions?start=${review.periodStart}&end=${review.periodEnd}`}>Answer Betti’s questions</Link>}</div>}
   {stage==='documentation'&&<div className="weekly-stage-message"><p>{missing.length?`I don’t have receipts for ${missing.length} of these expenses.`:'Your receipt check is complete for this week.'}</p>{missing.length>0&&<><p>The IRS may ask for records supporting a business expense if a return is examined. A missing receipt does not automatically remove an expense, and keeping it does not mean its documentation is complete.</p><ReceiptUploadAction variant="home"/><div className="weekly-document-actions"><button className="btn btn-secondary" disabled={busy} onClick={()=>void advance('include_missing')}>Include these expenses</button><button className="btn btn-quiet" disabled={busy} onClick={()=>void advance('exclude_missing')}>Exclude these expenses</button><button className="btn btn-quiet" disabled={busy} onClick={()=>setIndividualDocumentation(value=>!value)}>Review individually</button></div>{individualDocumentation&&<ul className="weekly-transaction-list weekly-document-review">{missing.map(item=><TransactionRow key={item.id} item={item}><div className="weekly-document-actions"><button className="btn btn-secondary" disabled={busy} onClick={()=>void decideOne(item,'include_missing')}>Include expense</button><button className="btn btn-quiet" disabled={busy} onClick={()=>void decideOne(item,'exclude_missing')}>Exclude expense</button></div></TransactionRow>)}</ul>}</>}</div>}
   {stage==='mileage'&&<MileageStage review={review}/>}
   {stage==='final'&&<div className="weekly-stage-message"><p>Personal activity is out of the business view, mixed purchases use the business amount you gave us, and your current-week questions are settled.</p></div>}
   {error&&<p role="alert" className="weekly-workflow-error">{error}</p>}
   <footer className="weekly-workflow-actions"><button className="btn btn-primary" disabled={busy||(stage==='questions'&&currentQuestionCount>0)||(stage==='documentation'&&missing.length>0)} onClick={()=>void advance()}>{busy?'Saving…':stage==='personal'?'Continue to shared purchases':stage==='mixed'?'Continue to Betti’s questions':stage==='questions'?'Continue to receipts':stage==='documentation'?'Continue to mileage':stage==='mileage'?(review.mileage.entries.length?'No, that’s everything':'No, no business driving'):'Prepare my review'}</button><button className="btn btn-quiet">Not right now</button></footer>
  </div></section>
}

function MileageStage({review}:{review:CustomerWeeklyReview}){const entries=review.mileage.entries
 return <div className="weekly-stage-message"><p>{entries.length?`You recorded ${entries.length} business ${entries.length===1?'trip':'trips'} this week.`:'Did you drive for your business this week?'}</p>{entries.length>0&&<ul className="weekly-mileage-list">{entries.map(entry=><li key={entry.id}><strong>{entry.milesMilli/1000} miles</strong><span>{formatReviewActivityDate(entry.date)}{entry.purpose?` · ${entry.purpose}`:''}</span></li>)}</ul>}<Link href={`/mileage?review=${review.id}`} className="btn btn-secondary">{entries.length?'Add another trip':'Yes — add a trip'}</Link></div>}

export function WeeklyReview({review,currentQuestionCount=0}:{review:CustomerWeeklyReview;currentQuestionCount?:number}){
 if(!review.snapshotId)return <WorkflowReview review={review} currentQuestionCount={currentQuestionCount}/>
 return <FinalReview review={review}/>
}

function FinalReview({review}:{review:CustomerWeeklyReview}){const[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('')
 async function action(value:'confirmed'|'deferred'){setBusy(true);setError('');const response=await fetch(`/api/bookkeeping/reviews/${review.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:value,expectedEventId:review.eventId,snapshotId:review.snapshotId,requestId:crypto.randomUUID()})});if(!response.ok){setError('This review changed. Refresh and take another look.');setBusy(false);return}setDone(true)}
 if(done)return <section className="home-review home-review-done"><span className="home-review-check">✓</span><div><h2>Thanks — I’ve recorded your review.</h2><p>WriteOffs will keep working in the background.</p></div></section>
 return <section className="home-review" aria-labelledby="weekly-review-heading"><div className="home-review-heading"><div><p className="home-kicker">Your weekly check-in</p><p className="home-review-period">{formatReviewPeriod(review.periodStart,review.periodEnd)}</p><h2 id="weekly-review-heading">Here’s what I handled.</h2></div></div><div className="home-review-sheet"><dl className="home-review-totals">{review.scope==='business'&&<div><dt>Income</dt><dd>{money.format((review.incomeCents??0)/100)}</dd></div>}<div><dt>Business expenses</dt><dd>{money.format(review.expenseCents/100)}</dd></div><div><dt>Activity handled</dt><dd>{review.items.length}</dd></div></dl><ul className="home-review-items">{review.items.map(item=><li key={item.id} data-kind={item.role==='income'?'income':item.treatment==='mixed_use'?'mixed':'expense'}><Link href={item.transactionId?`/transactions/${item.transactionId}?review=${review.id}&snapshot=${review.snapshotId}&event=${review.eventId}`:'/receipts'}><i aria-hidden="true">{item.role==='income'?'↓':item.treatment==='mixed_use'?'½':'✓'}</i><strong>{item.label}</strong><span className="home-review-meta"><time dateTime={item.date}>{formatReviewActivityDate(item.date)}</time>{item.categoryLabel&&<> · <span className="home-review-category">{item.categoryLabel}</span></>} · {reviewTreatmentLabel(item)}</span><b>{money.format(Math.abs(item.amountCents)/100)}</b></Link></li>)}</ul></div><div className="home-review-footer"><div><h3>Anything you’d like to change?</h3><p>This confirms the exact cleaned review shown here—not each transaction one by one.</p></div><div className="home-review-actions"><button disabled={busy} onClick={()=>void action('confirmed')} className="btn btn-primary">Everything looks right</button><Link href="/transactions" className="btn btn-secondary">Make a change</Link><button disabled={busy} onClick={()=>void action('deferred')} className="btn btn-quiet">Not right now</button></div></div>{error&&<p role="alert" className="weekly-workflow-error">{error}</p>}</section>}

function nextStage(stage:WeeklyReviewStage):WeeklyReviewStage{return({personal:'mixed',mixed:'questions',questions:'documentation',documentation:'mileage',mileage:'final',final:'final'}as Record<WeeklyReviewStage,WeeklyReviewStage>)[stage]}
function parseDollars(value:string){if(!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))return null;const[d,c='']=value.trim().split('.'),amount=Number(d)*100+Number(c.padEnd(2,'0'));return Number.isSafeInteger(amount)?amount:null}
