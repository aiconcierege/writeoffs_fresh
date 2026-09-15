'use client'
import {useRef, useState} from 'react'
import {launchMembership} from '../lib/membership/plans'

export function MembershipChooser() {
  const [working,setWorking]=useState(false), [error,setError]=useState('')
  const requestKey=useRef<string|null>(null), lock=useRef(false)
  async function choose() {
    if(lock.current)return
    lock.current=true;setWorking(true);setError('')
    requestKey.current??=crypto.randomUUID()
    try {
      const response=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({plan:'business',requestKey:requestKey.current})})
      const data=await response.json()
      if(!response.ok||!data.url)throw new Error()
      window.location.assign(data.url)
    } catch {setError('We couldn’t start checkout. Please try again.');setWorking(false);lock.current=false}
  }
  return <section className="membership-offer mt-8" aria-labelledby="offer-name">
    <h2 id="offer-name" className="text-xl font-semibold">{launchMembership.name}</h2>
    <p className="mt-4 text-[#59665f]"><span className="text-5xl font-semibold tracking-tight text-[#17211d]">{launchMembership.displayPrice}</span> / month</p>
    <ul className="my-6 space-y-2 text-[15px] leading-6">
      {['Connect bank accounts and credit cards','Organize business income and expenses','Keep receipts organized','Track business mileage','Answer Betti when she needs something','Get your books ready for tax preparation'].map(text=><li key={text} className="flex gap-3"><span aria-hidden="true" className="text-[#168166]">✓</span>{text}</li>)}
    </ul>
    <button className="btn btn-primary min-h-12 w-full" disabled={working} onClick={()=>void choose()}>{working?'Opening secure checkout…':'Start WriteOffs — $39/month'}</button>
    <p className="mt-4 text-center text-sm text-[#59665f]">Cancel anytime.</p>
    {error&&<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </section>
}
