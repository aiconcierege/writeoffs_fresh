'use client'
import Link from 'next/link'
import { useEffect,useState } from 'react'

export function QuestionInvitation({count,compact=false}:{count:number;compact?:boolean}){
  const[hidden,setHidden]=useState(true)
  useEffect(()=>{const until=Number(localStorage.getItem('writeoffs-question-prompt-after')??0);setHidden(until>Date.now())},[])
  if(hidden)return <p className={compact?'home-question-saved':'mt-5 text-sm text-[#59665f]'}><Link href="/questions" className="font-semibold text-[#243186]">Questions are saved for your next check-in.</Link></p>
  return <div className={compact?'home-question-actions':'mt-6'}>{!compact&&<p className="text-lg text-[#34423a]">I have {count} quick {count===1?'question':'questions'} for you. Is now a good time?</p>}
    <div className={compact?'flex flex-wrap gap-3':'mt-4 flex flex-wrap gap-3'}><Link href="/questions" className="btn btn-primary">Yes, let’s do it</Link>
      <button type="button" className="btn btn-secondary" onClick={()=>{localStorage.setItem('writeoffs-question-prompt-after',String(Date.now()+7*86400000));setHidden(true)}}>Not right now</button></div></div>
}
