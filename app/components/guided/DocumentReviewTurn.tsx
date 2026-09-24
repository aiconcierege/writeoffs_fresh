'use client'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {GuidedWorkProjection} from '../../lib/bookkeeping/guided-work-projection'
import type {DocumentReview} from '../../lib/bookkeeping/document-review'
import {MerchantIdentity} from './MerchantIdentity'
import {presentConversationTurn} from './present-conversation-turn'
export type DocumentTurn={businessId:string;documentIds:string[];recordIds:string[];actionId:string;workstream?:string;transaction?:{merchant:string;date:string|null;amountCents:number|null};startedAt:number}
export const documentTurnKey=(businessId:string)=>`betti-document-turn:${businessId}`
export function restoredDocumentTurn(value:string|null,businessId:string):DocumentTurn|null{
 try{const p=JSON.parse(value??'null');return p?.businessId===businessId&&Array.isArray(p.documentIds)&&p.documentIds.length>0&&p.documentIds.length<=10&&p.documentIds.every((id:unknown)=>typeof id==='string')&&Array.isArray(p.recordIds)&&p.recordIds.length<=100&&p.recordIds.every((id:unknown)=>typeof id==='string')&&typeof p.actionId==='string'?p:null}catch{return null}
}
export function DocumentReviewTurn({turn,onContinue}:{turn:DocumentTurn;onContinue:(work:GuidedWorkProjection)=>void}){
 const[retry,setRetry]=useState(0)
 const[review,setReview]=useState<DocumentReview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const root=useRef<HTMLDivElement>(null),sequence=useRef(0),request=useRef<AbortController|null>(null),manual=useRef(false)
 const read=useCallback(async()=>{
  const id=++sequence.current;request.current?.abort();const controller=new AbortController();request.current=controller
  const p=new URLSearchParams({documents:turn.documentIds.join(',')});if(turn.recordIds.length)p.set('records',turn.recordIds.join(','))
  try{
  const response=await fetch('/api/bookkeeping/work/documents?'+p,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
  if(!response.ok)throw Error('I couldn’t confirm processing. Your files are saved. Please check again.')
  const result=await response.json() as {review:DocumentReview;work:GuidedWorkProjection}
  if(id!==sequence.current||controller.signal.aborted)throw new DOMException('Superseded','AbortError')
  setReview(result.review);setError('');return result
  }catch(e){if(id!==sequence.current||controller.signal.aborted)throw new DOMException('Superseded','AbortError');throw e}
 },[turn])
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined
  const poll=async()=>{if(manual.current){timer=setTimeout(poll,4000);return}try{const result=await read();if(alive&&result.review.phase==='processing')timer=setTimeout(poll,4000)}catch(e){if(alive&&!(e instanceof DOMException&&e.name==='AbortError'))setError('I couldn’t confirm processing. Your files are saved. Please check again.')}}
  void poll();return()=>{alive=false;request.current?.abort();clearTimeout(timer)}
 },[read,retry])
 useEffect(()=>{if(root.current)presentConversationTurn(root.current)},[review?.phase])
 async function check(advance=false){manual.current=true;setBusy(true);try{const result=await read();if(advance&&result.review.phase==='ready')onContinue(result.work);else if(result.review.phase==='processing')setRetry(n=>n+1)}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError('I couldn’t confirm processing. Your files are saved. Please check again.')}finally{manual.current=false;setBusy(false)}}
 const loan=!!review?.loanSplit,ready=review?.phase==='ready',attention=review?.phase==='needs_attention',loanRequest=/loan/i.test(turn.transaction?.merchant??'')
 const money=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:c%100?2:0}).format(c/100)
 return <div ref={root} data-document-review={review?.phase??'checking'} aria-busy={busy||!review||review.phase==='processing'}>
  {turn.transaction&&<MerchantIdentity id="guided-transaction" {...turn.transaction}/>}
  <h1>{attention?'I need another look at this document.':ready?loan?'Got it. I have what I need for this loan payment.':'Got it. I’ve reviewed your documents.':loanRequest?'Got it. I’m reviewing the loan statement.':'Got it. I’m reviewing your documents.'}</h1>
  <p className="betti-explanation">{attention?'Your upload is saved, but I couldn’t finish using it. Open your documents to see what I need.':ready?loan?`${money(review.loanSplit!.principalCents)} was principal and ${money(review.loanSplit!.interestCents)} was interest.`:review.remainingFact?'That helps. There’s still a detail I need your help with.':'I’ve updated what I can from this evidence.': 'Your upload is received. I’m checking what it tells me before we move on.'}</p>
  {!ready&&!attention&&!error&&<p role="status" aria-live="polite">Reviewing your documents… You can leave and return here.</p>}
  {error&&<p role="alert">{error}</p>}
  <div className="betti-continue">{ready&&!error?<button key="continue" className="btn btn-primary" disabled={busy} onClick={()=>void check(true)}>{busy?'Checking the next step…':'Continue →'}</button>:<button key="check" className="btn btn-secondary" disabled={busy} onClick={()=>void check()}>{busy?'Checking…':'Check document status'}</button>}
  {attention&&<Link className="btn btn-secondary" href="/import">View documents</Link>}<Link className="betti-defer" href="/home">Back to your books</Link></div>
 </div>
}
