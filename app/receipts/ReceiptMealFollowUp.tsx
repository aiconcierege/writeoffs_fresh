'use client'
import{useEffect,useState}from'react'
import{QuestionFlow}from'../questions/QuestionFlow'
import type{CustomerQuestion}from'../lib/bookkeeping/customer-questions'

export function ReceiptMealFollowUp({receiptId}:{receiptId:string}){
 const[state,setState]=useState<'reading'|'question'|'done'>('reading'),[questions,setQuestions]=useState<CustomerQuestion[]>([])
 useEffect(()=>{let stopped=false,attempt=0,timer:ReturnType<typeof setTimeout>
  const poll=async()=>{attempt+=1;const response=await fetch(`/api/receipts/${receiptId}/meal-follow-up`,{cache:'no-store'})
   const body=await response.json().catch(()=>({}));if(stopped)return
   if(response.ok&&body.state==='question_ready'&&body.questions?.length){setQuestions(body.questions);setState('question');return}
   if(response.ok&&['complete','not_a_meal_candidate','waiting_for_transaction'].includes(body.state)){setState('done');return}
   if(attempt<30)timer=setTimeout(()=>void poll(),2000);else setState('done')}
  void poll();return()=>{stopped=true;clearTimeout(timer)}},[receiptId])
 if(state==='done')return null
 if(state==='reading')return <div className="receipt-meal-follow-up" role="status"><strong>Betti is reading your receipt.</strong><p>If I need one more detail, I’ll ask here.</p></div>
 return <div className="receipt-meal-follow-up"><p className="eyebrow">One quick detail</p>
  <QuestionFlow initialQuestions={questions} embedded recordId={questions[0]?.recordId} onComplete={()=>setState('done')}/></div>
}
