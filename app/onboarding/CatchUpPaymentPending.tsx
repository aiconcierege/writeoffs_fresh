'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
export function CatchUpPaymentPending() {
 const router=useRouter(),[attempts,setAttempts]=useState(0)
 useEffect(()=>{if(attempts>=15)return;const timer=setTimeout(()=>{setAttempts(value=>value+1);router.refresh()},2000);return()=>clearTimeout(timer)},[attempts,router])
 return <section className="mx-auto max-w-xl py-12"><h1 className="text-3xl font-semibold tracking-tight">Confirming your catch-up payment</h1><p className="mt-5 leading-7 text-[#59665f]" role="status">Your starting month is saved. We’re waiting for secure payment confirmation before adding the earlier months.</p><p className="mt-4 text-sm text-[#59665f]">You can leave and return to setup. Please don’t pay again.</p><button type="button" className="btn btn-secondary mt-6" onClick={()=>router.refresh()}>Check payment status</button></section>
}
