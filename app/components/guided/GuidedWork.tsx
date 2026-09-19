'use client'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {GuidedWorkProjection} from '../../lib/bookkeeping/guided-work-projection'
import type {WorkAction} from '../../lib/bookkeeping/betti-work'
import {homeCommand} from '../../lib/home/command-center'
import {persistAccountUse,type AccountUseRequest} from '../../lib/bookkeeping/account-use-request'
import {parsePositiveDollarCents} from '../../lib/bookkeeping/question-input'
import type {SpecialWork} from '../../lib/bookkeeping/special-transactions'
import {QuestionFlow} from '../../questions/QuestionFlow'
import {DocumentIntake} from '../../documents/DocumentIntake'
import {SpecialTransactionFlow} from '../SpecialTransactionFlow'
import {ConversationShell,SelectionCard} from './ConversationShell'
import {MerchantIdentity} from './MerchantIdentity'

export function GuidedWork({initialWork,returnTo='/home',recordId,ordinary=false}:{initialWork:GuidedWorkProjection;returnTo?:string;recordId?:string;ordinary?:boolean}){
 const[work,setWork]=useState(initialWork),[handled,setHandled]=useState(0),[deferred,setDeferred]=useState(0)
 const action=work.presentation?.status==='settling'?null:work.presentation?.action??work.nextAction
 const presented=useRef<{id:string;version:string}|null>(null),readSequence=useRef(0),evidenceReceived=useRef(false)
 const checkingPresented=useRef(false)
 useEffect(()=>{if(action)presented.current={id:action.id,version:action.version}},[action])
 const[sessionReady,setSessionReady]=useState(false)
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(`betti-visit:${initialWork.businessId}`)??'null');if(saved&&Date.now()-saved.at<7200000){setHandled(saved.handled??0);setDeferred(saved.deferred??0)}}catch{/* Session progress is optional; canonical facts remain durable. */}setSessionReady(true)},[initialWork.businessId])
 useEffect(()=>{if(!sessionReady)return;try{sessionStorage.setItem(`betti-visit:${initialWork.businessId}`,JSON.stringify({handled,deferred,at:Date.now()}))}catch{/* Private browsing may disable session storage. */}},[handled,deferred,sessionReady,initialWork.businessId])
 const[notice,setNotice]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
 const backgroundRead=useRef<AbortController|null>(null),reconciling=useRef(false)
 const automaticReads=useRef(0)
 const[waitingPaused,setWaitingPaused]=useState(false)
 const lock=useRef(false),heading=useRef<HTMLHeadingElement>(null),root=useRef<HTMLDivElement>(null)
 const refresh=useCallback(async(signal?:AbortSignal,cause:'background'|'evidence'|'advance'='background')=>{
  const sequence=++readSequence.current
  if(cause==='advance')presented.current=null
  if(cause==='evidence'){evidenceReceived.current=true;setNotice('I’ve received your files. I’m checking what they answer.')}
  const params=new URLSearchParams({view:'guided'})
  if(recordId)params.set('record',recordId)
  if(presented.current){params.set('presented',presented.current.id);params.set('presentedVersion',presented.current.version)}
  const response=await fetch('/api/bookkeeping/work?'+params,{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})
  if(!response.ok)throw new Error('I couldn’t refresh your work. Please try again.')
  const updated=await response.json() as GuidedWorkProjection
  if(signal?.aborted||sequence!==readSequence.current)throw new DOMException('Superseded read','AbortError')
  const state=updated.presentation?.status
  if(state==='settling'){checkingPresented.current=true;setNotice('I’m checking new information before we continue.')}
  if(state==='retained'&&checkingPresented.current){checkingPresented.current=false;setNotice('I still need your help with this.')}
  if(state==='resolved'||state==='updated'||state==='deferred'||state==='rechecking'){
   setNotice(state==='rechecking'?'I’m still checking that item. We can work on this one meanwhile.':state==='deferred'?'This is saved for later.':state==='updated'?'I’ve checked the latest information. Here’s what I still need.':evidenceReceived.current?'Got it — I’ve checked the information you sent. We can move on from that question.':'My latest review took care of that question.')
   presented.current=null;evidenceReceived.current=false;checkingPresented.current=false
  }
  setWork(updated);return updated
 },[recordId])
 const needsProcessingRead=!action&&(work.betti.genuinelyProcessing+work.betti.queued+work.betti.retryScheduled>0||error==='I couldn’t check for updates. Refresh before answering.')
 const onPending=useCallback((pending:boolean)=>{lock.current=pending;if(pending){readSequence.current++;backgroundRead.current?.abort()}},[])
 useEffect(()=>{
  let alive=true
  const updateError='I couldn’t check for updates. Refresh before answering.'
  const read=async()=>{
   if(lock.current||reconciling.current||backgroundRead.current||document.visibilityState!=='visible')return
   const controller=new AbortController();backgroundRead.current=controller
   try{await refresh(controller.signal);if(alive&&!controller.signal.aborted)setError(current=>current===updateError?'':current)}
   catch{if(alive&&!controller.signal.aborted)setError(updateError)}
   finally{if(backgroundRead.current===controller)backgroundRead.current=null}
  }
  // Poll only while waiting. Never replace a ready question underneath a
  // customer's pointer or while they are reading/selecting an answer. Commands
  // still validate the exact version; focus and stale-write recovery refresh it.
  const delays=[500,1000,2000,4000,7000,10000,15000,20000,25000,30000,30000,30000]
  let timer:ReturnType<typeof setTimeout>|undefined
  const schedule=()=>{
   if(!alive||!needsProcessingRead)return
   if(automaticReads.current>=delays.length){setWaitingPaused(true);return}
   timer=setTimeout(async()=>{
    if(!alive)return
    if(!lock.current&&!reconciling.current&&!backgroundRead.current&&document.visibilityState==='visible'){
     automaticReads.current++;await read()
    }
    schedule()
   },document.visibilityState==='visible'?delays[automaticReads.current]:7000)
  }
  schedule();window.addEventListener('focus',read)
  return()=>{alive=false;backgroundRead.current?.abort();clearTimeout(timer);window.removeEventListener('focus',read)}
 },[refresh,needsProcessingRead,waitingPaused])
 // The entry record is a server-side priority hint, never a session boundary.
 useEffect(()=>{const title=root.current?.querySelector('h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true})}},[action?.id])
 const context=action?.workstream==='catch_up'?'Getting your books caught up':action?.workstream==='shared'?'Getting caught up and keeping up':action?.workstream==='current'?'Keeping your books up to date':'Work with Betti'
 async function recover(){
  backgroundRead.current?.abort();automaticReads.current=0;setWaitingPaused(false)
  setNotice('I’m checking the latest state of your books.')
  const alreadyReconciling=reconciling.current;reconciling.current=true
  try{await refresh();setError('')}catch{setError('I couldn’t check for updates. Refresh before answering.')}finally{reconciling.current=alreadyReconciling}
 }
 async function resolved(isDeferred:boolean,message?:string,nextWork?:GuidedWorkProjection){
  backgroundRead.current?.abort();reconciling.current=true;automaticReads.current=0;setWaitingPaused(false)
  try{
  if(isDeferred)setDeferred(n=>n+1);else setHandled(n=>n+1)
  setNotice(isDeferred?'I saved this for later.':message??'Got it. I’ve saved what you told me.')
  if(nextWork){readSequence.current++;presented.current=null;evidenceReceived.current=false;checkingPresented.current=false;setWork(nextWork);setError('');return}
  // Explicit answer reconciliation, never a GET/render side effect.
  const reconciliation=isDeferred?{ok:true}:await fetch('/api/bookkeeping/questions/reconcile',{method:'POST',signal:AbortSignal.timeout(15000)})
  if(!reconciliation.ok){await recover();return}
  try{const next=await refresh(undefined,'advance');setError('');if(!isDeferred&&next.nextAction?.question&&action?.recordIds.some(id=>next.nextAction!.recordIds.includes(id)))setNotice('That helps. I have a follow-up about this purchase.')}catch{setError('I couldn’t check for updates. Refresh before answering.')}
  requestAnimationFrame(()=>heading.current?.focus())
  }catch{await recover()}finally{reconciling.current=false}
 }
 async function perform(command:()=>Promise<GuidedWorkProjection|void>,isDeferred=false){
  if(lock.current)return;onPending(true);setSaving(true);setError('')
  try{const next=await command();await resolved(isDeferred,undefined,next??undefined)}catch(e){setError(e instanceof Error?e.message:'Your answer could not be confirmed.');try{await refresh()}catch{/* Explicit reload remains available. */}}
  finally{lock.current=false;setSaving(false)}
 }
 const home=homeCommand(work,'statement_uploads'),waiting=work.betti.genuinelyProcessing+work.betti.queued+work.betti.retryScheduled>0
 const progress=handled||deferred?`${handled} handled this visit${deferred?` · ${deferred} saved for later`:''}`:work.customer.actionableCount?`${work.customer.actionableCount} ${work.customer.actionableCount===1?'thing needs':'things need'} you`:''
 return <div ref={root} data-customer-action-count={work.customer.actionableCount} data-guided-action={action?.type??work.readiness.phase} data-guided-version={action?.version} data-guided-id={action?.id} data-guided-presentation={work.presentation?.status??'ready'}>
 <ConversationShell contentIdentity={action?.id+':'+action?.version} returnTo={returnTo} context={context} progress={progress} notice={notice} state={!action?waiting?'working':'caught-up':'question'}>
  {error&&<div className="betti-error" role="alert">{error}<button className="betti-defer" onClick={()=>void refresh().then(()=>setError('')).catch(()=>setError('Please try again in a moment.'))}>Refresh current work</button></div>}
  {!action?<><span className="betti-complete" hidden/><h1 ref={heading} tabIndex={-1}>{waiting?'I’m updating your books.':home.heading}</h1><p className="betti-explanation">{waiting?waitingPaused?'This is taking a little longer. You can return to your books or check again.':'I’m checking the records and facts you sent. I’ll continue here when the next step is ready. You can also return to your books.':home.state==='waiting'&&work.customer.deferredCount?'I’ve saved the things you want to come back to.':home.supporting}</p>{waiting&&<p className="betti-processing" role="status"><span className="betti-processing-dot"/> {work.betti.genuinelyProcessing?'Organizing your records':'Waiting to review your records'}</p>}{waiting&&waitingPaused&&<button className="betti-defer" onClick={()=>{automaticReads.current=0;setWaitingPaused(false);void refresh().catch(()=>setError('I couldn’t refresh your work. Please try again.'))}}>Check for the next step</button>}{home.alternative&&<Link className="btn btn-secondary" href={home.alternative.href}>{home.alternative.label}</Link>}<div className="betti-continue"><Link className="btn btn-primary" href={returnTo}>Back to your books</Link></div></>
  :action.type==='account_use'?<AccountStep key={action.id+action.version} action={action} busy={saving} perform={perform}/>
  :action.items?<SweepStep key={action.id+action.version} action={action} busy={saving} perform={perform} refresh={()=>refresh(undefined,'evidence')} onPending={onPending}/>
  :action.type==='special_transaction'&&(!ordinary||!action.recordIds.includes(recordId??'')||!action.question)?<SpecialStep key={action.id+action.version} action={action} returnTo={returnTo} resolved={resolved} recover={recover} onPending={onPending} onEvidenceReceived={async()=>{await refresh(undefined,'evidence')}}/>
  :action.question?<><MerchantIdentity id="guided-transaction" merchant={action.question.transaction.merchant} date={action.question.transaction.date} amountCents={action.question.transaction.amountCents}/><QuestionFlow key={action.question.id+action.question.version} initialQuestions={[action.question]} guided onGuidedAnswer={resolved} onGuidedRefresh={recover} onGuidedPending={onPending} returnTo={returnTo}/></>
  :<><h1>{action.type==='recover_ingestion'?'Let’s take another look at this document.':'Send me your financial activity.'}</h1><p className="betti-explanation">{action.type==='recover_ingestion'?'Your original is safe. Open the document to see what will help me read it.':'Connected accounts are the easiest way to keep up. Statements work too.'}</p><div className="betti-continue"><Link className="btn btn-primary" href={action.href}>{action.type==='recover_ingestion'?'View document':'Send documents'}</Link>{action.type==='provide_records'&&<Link className="betti-defer" href="/get-started">Connect accounts instead</Link>}</div></>}
 </ConversationShell></div>
}
function AccountStep({action,busy,perform}:{action:WorkAction;busy:boolean;perform:(fn:()=>Promise<GuidedWorkProjection|void>,deferred?:boolean)=>Promise<void>}){
 const request=useRef<AccountUseRequest|null>(null),account=action.account!
 return <><MerchantIdentity merchant={account.name} detail={account.mask?`Account ending ${account.mask}`:undefined}/><h1>How did you use this account?</h1><p className="betti-explanation">I’ll use this setting for the account. You can still change any purchase.</p><div className="betti-choices">{([['business_only','Business only','I use this account for my business.'],['business_and_personal','Business + personal','There’s personal activity in this account too.']] as const).map(([designation,label,description])=><SelectionCard key={designation} disabled={busy} onClick={()=>void perform(async()=>{if(request.current?.designation!==designation)request.current={designation,effectiveAt:new Date().toISOString(),requestId:crypto.randomUUID()};let next:GuidedWorkProjection|undefined;await persistAccountUse(account.id,request.current,value=>{next=value});return next})}><span>{label}<small>{description}</small></span></SelectionCard>)}</div>{busy&&<p role="status">Saving your account choice…</p>}</>
}
function SweepStep({action,busy,perform,refresh,onPending}:{onPending:(pending:boolean)=>void;action:WorkAction;busy:boolean;perform:(fn:()=>Promise<GuidedWorkProjection|void>,deferred?:boolean)=>Promise<void>;refresh:()=>Promise<GuidedWorkProjection>}){
 const[answers,setAnswers]=useState<Record<string,{use:string;businessDollars?:string}>>({}),[uploading,setUploading]=useState(false),[showUpload,setShowUpload]=useState(false),[uploadReadError,setUploadReadError]=useState(false),request=useRef<{signature:string;id:string}|null>(null)
 async function readAfterUpload(){setUploading(true);try{await refresh();setUploadReadError(false)}catch{setUploadReadError(true)}finally{setUploading(false);onPending(false)}}
 function uploadState(value:boolean,result?:{received:number}){setUploading(value);if(value)onPending(true);else if(result?.received)void readAfterUpload();else onPending(false)}
 const personal=action.type==='personal_exception_sweep',mixed=action.type==='mixed_use_sweep',mixedAccount=action.account?.designation==='business_and_personal'
 const receipt=action.type==='receipt_upload_sweep',availability=action.type==='receipt_availability',items=action.items!
 const title=personal?'Is anything here personal?':mixed?mixedAccount?'How were these purchases used?':'Is anything partly personal?':receipt?`I’m missing receipts for ${items.length} ${items.length===1?'purchase':'purchases'}.`:'Is that all the receipts you have?'
 const explanation=personal?'I’m treating these as business because this is your business-only account. Tell me if anything was personal.':mixed?mixedAccount?'Choose the use of each purchase. For anything mixed, tell me the business dollars—I’ll handle the split.':'Select any partly personal purchases and enter the business dollars. Leave the others unselected.':receipt?'Send me the ones you have and I’ll match them.':'This confirmation covers only the purchases shown here. Missing receipts stay recorded separately; they don’t erase your business expenses.'
 const valid=!mixed||items.every(i=>{const a=answers[i.recordId];if(mixedAccount&&!a)return false;if(a?.use!=='mixed')return true;const n=parsePositiveDollarCents(a.businessDollars??'');return n!==null&&n>0&&n<Math.abs(i.amountCents)})
 function save(disposition:'completed'|'deferred'){
  return perform(async()=>{
   const supplied=disposition==='deferred'?{}:Object.fromEntries(Object.entries(answers).map(([id,a])=>[id,{use:a.use,...(a.use==='mixed'?{businessCents:parsePositiveDollarCents(a.businessDollars??'')}: {})}]))
   const payload={actionId:action.id,version:action.version,items,disposition,answers:supplied},signature=JSON.stringify(payload)
   if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()}
   const response=await fetch('/api/bookkeeping/work/answer',{method:'POST',headers:{'content-type':'application/json','x-betti-guided':'1'},body:JSON.stringify({...payload,requestId:request.current.id}),signal:AbortSignal.timeout(15000)})
   const result=await response.json();if(!response.ok)throw new Error(result.error??'Please refresh this group.');return result.work as GuidedWorkProjection|undefined
  },disposition==='deferred')
 }
 return <><h1>{title}</h1><p className="betti-explanation">{explanation}</p>{action.account&&<p className="betti-workstream">{action.account.name}{action.account.mask?` · ${action.account.mask}`:''} · {items.length} shown</p>}
 {uploadReadError&&<div role="alert" className="betti-error">I couldn’t check the latest document status. Refresh before continuing.<button className="betti-defer" disabled={uploading} onClick={()=>void readAfterUpload()}>Refresh document status</button></div>}
 <div className="betti-batch" role="group" tabIndex={receipt||availability?0:undefined} aria-label="Purchases in this review">{items.map(item=>{const answer=answers[item.recordId];return <div className="betti-batch-row" key={item.recordId}>
  {personal||mixed&&!mixedAccount?<label className="betti-batch-label"><input type="checkbox" disabled={busy} checked={!!answer} aria-label={`${personal?'Personal':'Partly personal'}: ${item.merchant}, ${item.date}, ${(Math.abs(item.amountCents)/100).toFixed(2)} dollars`} onChange={e=>setAnswers(old=>{const next={...old};if(e.target.checked)next[item.recordId]={use:personal?'personal':'mixed'};else delete next[item.recordId];return next})}/><MerchantIdentity compact merchant={item.merchant} date={item.date} amountCents={item.amountCents}/></label>:<MerchantIdentity compact merchant={item.merchant} date={item.date} amountCents={item.amountCents}/>}
  {mixed&&mixedAccount&&<div className="betti-row-choices" role="group" aria-label={`Use of ${item.merchant}`}>{[['business','Business'],['personal','Personal'],['mixed','Partly personal']].map(([use,label])=><button key={use} disabled={busy} aria-pressed={answer?.use===use} onClick={()=>setAnswers(old=>({...old,[item.recordId]:{use}}))}>{label}</button>)}</div>}
  {answer?.use==='mixed'&&<label className="betti-business-dollars">Business dollars for {item.merchant}<input inputMode="decimal" value={answer.businessDollars??''} placeholder="0.00" disabled={busy} onChange={e=>setAnswers(old=>({...old,[item.recordId]:{use:'mixed',businessDollars:e.target.value}}))}/></label>}
 </div>})}</div>

 {receipt&&<><DocumentIntake guided compact buttonLabel="Choose receipts" onUploadState={uploadState}/><button className="betti-defer" disabled={busy||uploading} onClick={()=>void save('deferred')}>I’ll send receipts later</button></>}
 {availability&&<button className="betti-defer" onClick={()=>setShowUpload(value=>!value)}>I have another receipt to send</button>}{availability&&showUpload&&<DocumentIntake guided compact onUploadState={uploadState}/>}
 <div className="betti-continue"><button className={`btn ${receipt?'btn-secondary':'btn-primary'}`} disabled={busy||!valid||uploading||uploadReadError} onClick={()=>void save('completed')}>{busy?'Saving…':availability?'That’s all the receipts I have':personal?Object.keys(answers).length?'Save personal exceptions':'Nothing here is personal':mixed?mixedAccount?'Save these facts':Object.keys(answers).length?'Save business portions':'Nothing is partly personal': 'Review without more receipts'}</button></div>
 {!receipt&&<button className="betti-defer" disabled={busy||uploading} onClick={()=>void save('deferred')}>{availability?'I’ll send receipts later':'I’ll come back to this'}</button>}</>
}
function SpecialStep({action,returnTo,resolved,recover,onPending,onEvidenceReceived}:{onEvidenceReceived:()=>Promise<void>;onPending:(pending:boolean)=>void;action:WorkAction;returnTo:string;resolved:(deferred:boolean,message?:string,work?:GuidedWorkProjection)=>Promise<void>;recover:()=>Promise<void>}){
 const detailRecordId=action.recordIds[0],detailVersion=action.version,decisionVersion=action.decisionVersion
 const recovery=useRef(recover);useEffect(()=>{recovery.current=recover},[recover])
 const[work,setWork]=useState<SpecialWork|null>(null),[failed,setFailed]=useState(false),[ordinary,setOrdinary]=useState(false)
 useEffect(()=>{let live=true;fetch(`/api/bookkeeping/records/${detailRecordId}/special${decisionVersion?`?expected=${encodeURIComponent(decisionVersion)}`:''}`,{cache:'no-store'}).then(async r=>{if(r.status===409||r.status===404){if(live)await recovery.current();throw new Error()}if(!r.ok)throw new Error();const data=await r.json();if(live)setWork(data.work)}).catch(()=>{if(live)setFailed(true)});return()=>{live=false}},[detailRecordId,detailVersion,decisionVersion])
 const transaction=action.question?.transaction??action.transaction
 return <>{transaction&&<MerchantIdentity id="guided-transaction" merchant={transaction.merchant} date={transaction.date} amountCents={transaction.amountCents}/>} {work?work.kind&&!ordinary?<SpecialTransactionFlow work={work} returnTo={returnTo} embedded onResolved={resolved} onRecoveryRefresh={recover} onPending={onPending} onEvidenceReceived={onEvidenceReceived} onOrdinaryRequest={action.question?()=>setOrdinary(true):undefined}/>:action.question?<QuestionFlow key={action.question.id+action.question.version} initialQuestions={[action.question]} guided onGuidedAnswer={resolved} onGuidedRefresh={recover} onGuidedPending={onPending} returnTo={returnTo}/>:<p>No customer question is available for this activity.</p>:<p role="status">{failed?'I couldn’t load this detail. Please refresh.':'Getting the payment details…'}</p>}</>
}
