'use client'
import Link from'next/link'
import{FormEvent,useState}from'react'
import{useRouter}from'next/navigation'

export function resolveAskBettiDestination(value:string){
  const text=value.trim(),lower=text.toLowerCase();if(!text)return null
  if(/\b(report|july|month|year|spent on|income|profit)\b/.test(lower))return'/reports'
  if(/\b(mile|mileage|trip|driv)\w*\b/.test(lower))return'/mileage'
  if(/\b(invoice|bill a customer)\b/.test(lower))return'/invoices'
  if(/\b(record money|cash|check|money received|money spent)\b/.test(lower))return'/money'
  if(/\b(receipt)\b/.test(lower)){
    const merchant=text.replace(/\b(did|do|i|have|upload|uploaded|find|show|me|my|the|a|an|receipt|for|this|purchase)\b/gi,' ').replace(/[?!.]+$/g,'').replace(/\s+/g,' ').trim()
    return merchant?`/transactions?q=${encodeURIComponent(merchant)}`:'/receipts'
  }
  if(/\b(transaction|purchase|charge|fix|correct)\b/.test(lower))return'/transactions'
  return null
}

export function HomeAskBetti(){const router=useRouter(),[value,setValue]=useState(''),[limited,setLimited]=useState(false)
 function submit(event:FormEvent){event.preventDefault();const destination=resolveAskBettiDestination(value);if(destination){router.push(destination);return}setLimited(true)}
 return <section className="home-ask" aria-labelledby="ask-betti-heading"><div><p className="home-kicker">Ask Betti</p><h2 id="ask-betti-heading">What can I help you find?</h2><p>Ask about a record or tell me what you want to do in WriteOffs.</p></div><form onSubmit={submit}><label className="sr-only" htmlFor="ask-betti-input">Ask Betti about your books</label><input id="ask-betti-input" value={value} onChange={event=>{setValue(event.target.value);setLimited(false)}} placeholder="Ask Betti about your books…"/><button className="btn btn-primary">Continue</button></form>{limited&&<div className="home-ask-limit" role="status"><p>I can help you find records and common WriteOffs tasks today, but I can’t safely answer that question from here yet.</p><div><Link href="/transactions">Find a transaction</Link><Link href="/reports">See reports</Link><Link href="/questions">See what I need</Link></div></div>}</section>
}
