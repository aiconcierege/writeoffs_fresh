'use client'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {BettiWorkProjection,WorkAction} from '../../lib/bookkeeping/betti-work'
import {homeCommand} from '../../lib/home/command-center'
import {persistAccountUse,type AccountUseRequest} from '../../lib/bookkeeping/account-use-request'
import {parsePositiveDollarCents} from '../../lib/bookkeeping/question-input'
import type {SpecialWork} from '../../lib/bookkeeping/special-transactions'
import {QuestionFlow} from '../../questions/QuestionFlow'
import {DocumentIntake} from '../../documents/DocumentIntake'
import {SpecialTransactionFlow} from '../SpecialTransactionFlow'
import {ConversationShell,SelectionCard} from './ConversationShell'
import {MerchantIdentity} from './MerchantIdentity'

export function GuidedWork({initialWork,returnTo='/home',recordId,ordinary=false}:{initialWork:BettiWorkProjection;returnTo?:string;recordId?:string;ordinary?:boolean}){
 const[work,setWork]=useState(initialWork),[handled,setHandled]=useState(0),[deferred,setDeferred]=useState(0),[paused,setPaused]=useState(false)
 const[sessionReady,setSessionReady]=useState(false)
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(`betti-visit:${initialWork.businessId}`)??'null');if(saved&&Date.now()-saved.at<7200000){setHandled(saved.handled??0);setDeferred(saved.deferred??0);setPaused(saved.paused===true)}}catch{/* Session progress is optional; canonical facts remain durable. */}setSessionReady(true)},[initialWork.businessId])
 useEffect(()=>{if(!sessionReady)return;try{sessionStorage.setItem(`betti-visit:${initialWork.businessId}`,JSON.stringify({handled,deferred,paused,at:Date.now()}))}catch{/* Private browsing may disable session storage. */}},[handled,deferred,paused,sessionReady,initialWork.businessId])
 const[notice,setNotice]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
 const lock=useRef(false),heading=useRef<HTMLHeadingElement>(null),root=useRef<HTMLDivElement>(null)
 const refresh=useCallback(async()=>{
  const response=await fetch('/api/bookkeeping/work'+(recordId?`?record=${recordId}`:''),{cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!response.ok)throw new Error('I couldn’t refresh your work. Please try again.')
  const updated=await response.json() as BettiWorkProjection;setWork(updated);return updated
 },[recordId])
 useEffect(()=>{let alive=true;const read=async()=>{if(lock.current||document.visibilityState!=='visible')return;try{await refresh()}catch{if(alive)setError('I couldn’t check for updates. Refresh before answering.')}};const timer=setInterval(read,7000);window.addEventListener('focus',read);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',read)}},[refresh])
 const action=work.customer.actionable.find(a=>!recordId||a.recordIds.includes(recordId))
 useEffect(()=>{const title=root.current?.querySelector('h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true})}},[action?.id,paused])
 const context=action?.workstream==='catch_up'?'Getting your earlier books caught up':action?.workstream==='shared'?'Helping your earlier and current books':action?.workstream==='current'?'Keeping your books up to date':'Work with Betti'
 async function resolved(isDeferred:boolean){
  if(isDeferred)setDeferred(n=>n+1);else setHandled(n=>n+1)
  setNotice(isDeferred?'I saved this for later.':'Got it. I’ve saved what you told me.')
  // Explicit answer reconciliation, never a GET/render side effect.
  await fetch('/api/bookkeeping/questions/reconcile',{method:'POST'})
  try{const next=await refresh();setError('');if(!isDeferred&&next.nextAction?.question&&action?.recordIds.some(id=>next.nextAction!.recordIds.includes(id)))setNotice('That helps. I have a follow-up about this purchase.')}catch(e){setError(e instanceof Error?e.message:'Please refresh.')}
  if(handled+deferred+1>=5)setPaused(true)
  requestAnimationFrame(()=>heading.current?.focus())
 }
 async function perform(command:()=>Promise<void>,isDeferred=false){
  if(lock.current)return;lock.current=true;setSaving(true);setError('')
  try{await command();await resolved(isDeferred)}catch(e){setError(e instanceof Error?e.message:'Your answer could not be confirmed.');try{await refresh()}catch{/* Explicit reload remains available. */}}
  finally{lock.current=false;setSaving(false)}
 }
 const home=homeCommand(work,'statement_uploads'),waiting=work.betti.genuinelyProcessing+work.betti.queued+work.betti.retryScheduled>0
 const progress=handled||deferred?`${handled} handled this visit${deferred?` · ${deferred} saved for later`:''}`:'One thing at a time'
 return <div ref={root} data-customer-action-count={work.customer.actionableCount} data-guided-action={paused?'session_complete':action?.type??work.readiness.phase}>
 <ConversationShell returnTo={returnTo} context={context} progress={progress} notice={notice} state={!action?waiting?'working':'caught-up':'question'}>
  {error&&<div className="betti-error" role="alert">{error}<button className="betti-defer" onClick={()=>void refresh().then(()=>setError('')).catch(()=>setError('Please try again in a moment.'))}>Refresh current work</button></div>}
  {paused?<><h1 ref={heading} tabIndex={-1}>We’ve made good progress.</h1><p className="betti-explanation">You handled {handled} {handled===1?'thing':'things'} this visit.{deferred?` I saved ${deferred} for later.`:''} You can stop here or keep going.</p><div className="betti-continue"><Link className="btn btn-primary" href={returnTo}>Back to your books</Link>{action&&<button className="betti-defer" onClick={()=>{setPaused(false);setHandled(0);setDeferred(0)}}>Keep going with Betti</button>}</div></>
  :!action?<><h1 ref={heading} tabIndex={-1}>{waiting?'I’ve got it from here.':home.heading}</h1><p className="betti-explanation">{waiting?'I’m checking the records and facts you sent. I’ll ask when I need something from you.':home.supporting}</p>{waiting&&<p className="betti-processing" role="status"><span className="betti-processing-dot"/> {work.betti.genuinelyProcessing?'Organizing your records':'Waiting for assessment'}</p>}{home.alternative&&<Link className="btn btn-secondary" href={home.alternative.href}>{home.alternative.label}</Link>}<div className="betti-continue"><Link className="btn btn-primary" href={returnTo}>Back to your books</Link></div></>
  :action.type==='account_use'?<AccountStep key={action.id+action.version} action={action} busy={saving} perform={perform}/>
  :action.items?<SweepStep key={action.id+action.version} action={action} busy={saving} perform={perform} refresh={refresh}/>
  :(action.type==='special_transaction'||action.question?.kind==='transaction_type')&&!ordinary?<SpecialStep key={action.id+action.version} action={action} returnTo={returnTo} resolved={resolved}/>
  :action.question?<><MerchantIdentity id="guided-transaction" merchant={action.question.transaction.merchant} date={action.question.transaction.date} amountCents={action.question.transaction.amountCents}/><QuestionFlow key={action.question.id+action.question.version} initialQuestions={[action.question]} guided onGuidedAnswer={resolved} returnTo={returnTo}/></>
  :<><h1>{action.type==='recover_ingestion'?'Let’s take another look at this document.':'Send me your financial activity.'}</h1><p className="betti-explanation">{action.type==='recover_ingestion'?'Your original is safe. Open the document to see what will help me read it.':'Connected accounts are the easiest way to keep up. Statements work too.'}</p><div className="betti-continue"><Link className="btn btn-primary" href={action.href}>{action.type==='recover_ingestion'?'View document':'Send documents'}</Link>{action.type==='provide_records'&&<Link className="betti-defer" href="/get-started">Connect accounts instead</Link>}</div></>}
 </ConversationShell></div>
}
function AccountStep({action,busy,perform}:{action:WorkAction;busy:boolean;perform:(fn:()=>Promise<void>,deferred?:boolean)=>Promise<void>}){
 const request=useRef<AccountUseRequest|null>(null),account=action.account!
 return <><MerchantIdentity merchant={account.name+(account.mask?` · ${account.mask}`:'')}/><h1>How did you use this account?</h1><p className="betti-explanation">Tell me once. I’ll use this for its activity in your books, and you can still change any individual purchase.</p><div className="betti-choices">{([['business_only','Business only','I use this account for my business.'],['business_and_personal','Business + personal','There’s personal activity in this account too.']] as const).map(([designation,label,description])=><SelectionCard key={designation} disabled={busy} onClick={()=>void perform(async()=>{if(request.current?.designation!==designation)request.current={designation,effectiveAt:new Date().toISOString(),requestId:crypto.randomUUID()};await persistAccountUse(account.id,request.current)})}><span>{label}<small>{description}</small></span></SelectionCard>)}</div>{busy&&<p role="status">Saving your account choice…</p>}</>
}
function SweepStep({action,busy,perform,refresh}:{action:WorkAction;busy:boolean;perform:(fn:()=>Promise<void>,deferred?:boolean)=>Promise<void>;refresh:()=>Promise<BettiWorkProjection>}){
 const[answers,setAnswers]=useState<Record<string,{use:string;businessDollars?:string}>>({}),[uploading,setUploading]=useState(false),[showUpload,setShowUpload]=useState(false),request=useRef<{signature:string;id:string}|null>(null)
 const personal=action.type==='personal_exception_sweep',mixed=action.type==='mixed_use_sweep',mixedAccount=action.account?.designation==='business_and_personal'
 const receipt=action.type==='receipt_upload_sweep',availability=action.type==='receipt_availability',items=action.items!
 const title=personal?'Is anything here personal?':mixed?mixedAccount?'How were these purchases used?':'Is anything partly personal?':receipt?'Send me the receipts you have.':'Is that all the receipts you have?'
 const explanation=personal?'I’m using this account’s business-only setting for these purchases. Select any personal exceptions.':mixed?mixedAccount?'Choose the use of each purchase. For anything mixed, tell me the business dollars—I’ll handle the split.':'Select any partly personal purchases and enter the business dollars. Leave the others unselected.':receipt?'These purchases don’t have receipts attached yet. Send what you have and I’ll look for the matches.':'This confirmation covers only the purchases shown here. Missing receipts stay recorded separately; they don’t erase your business expenses.'
 const valid=!mixed||items.every(i=>{const a=answers[i.recordId];if(mixedAccount&&!a)return false;if(a?.use!=='mixed')return true;const n=parsePositiveDollarCents(a.businessDollars??'');return n!==null&&n>0&&n<Math.abs(i.amountCents)})
 function save(disposition:'completed'|'deferred'){
  return perform(async()=>{
   const supplied=disposition==='deferred'?{}:Object.fromEntries(Object.entries(answers).map(([id,a])=>[id,{use:a.use,...(a.use==='mixed'?{businessCents:parsePositiveDollarCents(a.businessDollars??'')}: {})}]))
   const payload={actionId:action.id,version:action.version,items,disposition,answers:supplied},signature=JSON.stringify(payload)
   if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()}
   const response=await fetch('/api/bookkeeping/work/answer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestId:request.current.id}),signal:AbortSignal.timeout(15000)})
   const result=await response.json();if(!response.ok)throw new Error(result.error??'Please refresh this group.')
  },disposition==='deferred')
 }
 return <><h1>{title}</h1><p className="betti-explanation">{explanation}</p>{action.account&&<p className="betti-workstream">{action.account.name}{action.account.mask?` · ${action.account.mask}`:''} · {items.length} shown</p>}
 <div className="betti-batch" aria-label="Purchases in this review">{items.map(item=>{const answer=answers[item.recordId];return <div className="betti-batch-row" key={item.recordId}>
  {personal||mixed&&!mixedAccount?<label className="betti-batch-label"><input type="checkbox" disabled={busy} checked={!!answer} aria-label={`${personal?'Personal':'Partly personal'}: ${item.merchant}, ${item.date}, ${(Math.abs(item.amountCents)/100).toFixed(2)} dollars`} onChange={e=>setAnswers(old=>{const next={...old};if(e.target.checked)next[item.recordId]={use:personal?'personal':'mixed'};else delete next[item.recordId];return next})}/><MerchantIdentity compact merchant={item.merchant} date={item.date} amountCents={item.amountCents}/></label>:<MerchantIdentity compact merchant={item.merchant} date={item.date} amountCents={item.amountCents}/>}
  {mixed&&mixedAccount&&<div className="betti-row-choices" role="group" aria-label={`Use of ${item.merchant}`}>{[['business','Business'],['personal','Personal'],['mixed','Partly personal']].map(([use,label])=><button key={use} disabled={busy} aria-pressed={answer?.use===use} onClick={()=>setAnswers(old=>({...old,[item.recordId]:{use}}))}>{label}</button>)}</div>}
  {answer?.use==='mixed'&&<label className="betti-business-dollars">Business dollars for {item.merchant}<input inputMode="decimal" value={answer.businessDollars??''} placeholder="0.00" disabled={busy} onChange={e=>setAnswers(old=>({...old,[item.recordId]:{use:'mixed',businessDollars:e.target.value}}))}/></label>}
 </div>})}</div>
 {receipt&&<DocumentIntake guided compact onUploadState={value=>{setUploading(value);if(!value)void refresh()}}/>}
 {availability&&<button className="betti-defer" onClick={()=>setShowUpload(value=>!value)}>I have another receipt to send</button>}{availability&&showUpload&&<DocumentIntake guided compact onUploadState={value=>{setUploading(value);if(!value)void refresh()}}/>}
 <div className="betti-continue"><button className="btn btn-primary" disabled={busy||!valid||uploading} onClick={()=>void save('completed')}>{busy?'Saving…':availability?'That’s all the receipts I have':personal?Object.keys(answers).length?'Save personal exceptions':'Nothing here is personal':mixed?mixedAccount?'Save these facts':Object.keys(answers).length?'Save business portions':'Nothing is partly personal': 'Continue with Betti'}</button></div>
 <button className="betti-defer" disabled={busy||uploading} onClick={()=>void save('deferred')}>I’ll come back to this</button></>
}
function SpecialStep({action,returnTo,resolved}:{action:WorkAction;returnTo:string;resolved:(deferred:boolean)=>Promise<void>}){
 const[work,setWork]=useState<SpecialWork|null>(null),[failed,setFailed]=useState(false)
 useEffect(()=>{let live=true;fetch(`/api/bookkeeping/records/${action.recordIds[0]}/special`,{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();const data=await r.json();if(live)setWork(data.work)}).catch(()=>{if(live)setFailed(true)});return()=>{live=false}},[action])
 return <>{action.question&&<MerchantIdentity id="guided-transaction" merchant={action.question.transaction.merchant} date={action.question.transaction.date} amountCents={action.question.transaction.amountCents}/>} {work?work.kind?<SpecialTransactionFlow work={work} returnTo={returnTo} embedded onResolved={resolved}/>:action.question?<QuestionFlow key={action.question.id+action.question.version} initialQuestions={[action.question]} guided onGuidedAnswer={resolved} returnTo={returnTo}/>:<p>No customer question is available for this activity.</p>:<p role="status">{failed?'I couldn’t load this detail. Please refresh.':'Getting the payment details…'}</p>}</>
}
