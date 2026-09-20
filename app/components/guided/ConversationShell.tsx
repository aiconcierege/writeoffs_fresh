'use client'
import Link from 'next/link'
import {useEffect,useRef} from 'react'
import type {BettiState} from '../BettiIllustration'
import {BettiPresence} from '../experience/BettiPresence'
import {returnLabel,safeReturnTo} from '../../lib/navigation-context'
import './guided.css'

/** The stage and character never key on an action. Only its conversation advances. */
export function ConversationShell({children,context='Work with Betti',progress='',returnTo='/home',state='question',notice,contentIdentity}:{children:React.ReactNode;context?:string;progress?:string;returnTo?:string;state?:BettiState;notice?:string;contentIdentity?:string}){
 const back=safeReturnTo(returnTo,'/home'),content=useRef<HTMLDivElement>(null),previous=useRef(contentIdentity)
 useEffect(()=>{
  if(previous.current===contentIdentity)return
  previous.current=contentIdentity
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
  const animation=content.current?.animate([{opacity:.65},{opacity:1}],{duration:160,easing:'ease-out'})
  return()=>animation?.cancel()
 },[contentIdentity])
 return <div className="betti-work wo-experience">
  <header className="betti-destination"><div><p className="betti-destination-title">Work with Betti</p>{context!=='Work with Betti'&&<p className="betti-workstream">{context}</p>}</div><div className="betti-destination-actions"><span aria-live="polite">{progress}</span><nav aria-label="Return to your books"><Link href={back}>← {returnLabel(back)}</Link></nav></div></header>
  <div className="betti-conversation" data-conversation-stage>
   <div className="betti-guide"><p className="betti-eyebrow betti-guide-identity">Betti · Your bookkeeper</p><BettiPresence state={state} engagement="work" className="betti-guide-art" priority sizes="(max-width: 899px) 104px, (max-width: 1199px) 350px, 440px"/></div>
   <section className="betti-conversation-body" aria-label="Work with Betti">
    <p className="betti-saved" role="status">{notice||'\u00a0'}</p>
    <div ref={content} className="betti-active-conversation">{children}</div>
   </section>
  </div>
 </div>
}
export function SelectionCard({children,selected,onClick,disabled=false}:{children:React.ReactNode;selected?:boolean;onClick:()=>void;disabled?:boolean}){
 return <button type="button" className="betti-choice" aria-pressed={selected} onClick={onClick} disabled={disabled}>{children}<span aria-hidden="true">{selected?'✓':'→'}</span></button>
}
