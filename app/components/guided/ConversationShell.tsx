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
 return <div className="betti-work wo-experience"><nav className="betti-work-nav" aria-label="Return to your books"><Link href={back}>← {returnLabel(back)}</Link><span aria-live="polite">{progress}</span></nav>
  <div className="betti-conversation" data-conversation-stage>
   <div className="betti-guide"><BettiPresence state={state} engagement="work" className="betti-guide-art" priority sizes="(max-width: 639px) 76px, 180px"/></div>
   <section className="betti-conversation-body" aria-label="Work with Betti">
    <header className="betti-conversation-orientation"><p className="betti-eyebrow">Betti · Your bookkeeper</p><p className="betti-workstream">{context}</p></header>
    <p className="betti-saved" role="status">{notice||'\u00a0'}</p>
    <div ref={content} className="betti-active-conversation">{children}</div>
   </section>
  </div>
 </div>
}
export function SelectionCard({children,selected,onClick,disabled=false}:{children:React.ReactNode;selected?:boolean;onClick:()=>void;disabled?:boolean}){
 return <button type="button" className="betti-choice" aria-pressed={selected} onClick={onClick} disabled={disabled}>{children}<span aria-hidden="true">{selected?'✓':'→'}</span></button>
}
