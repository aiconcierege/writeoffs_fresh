'use client'
import Link from 'next/link'
import {useRef,useState} from 'react'
import {DocumentIntake} from '../documents/DocumentIntake'
import BankConnect from '../components/BankConnect'
import {BettiPageIntro} from '../components/ui'
export function GetStartedFlow(props:React.ComponentProps<typeof BankConnect>&{documentFirst?:boolean}) {
  const hasAccounts=props.accounts.length>0
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false)
  async function finish() {
    if(lock.current)return
    lock.current=true;setBusy(true);setError('')
    try {
      const response=await fetch('/api/onboarding/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error)
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Recheck the completed server prerequisite without a prefetched redirect.
      window.location.assign('/home')
    } catch(error) {setError(error instanceof Error?error.message:'We couldn’t finish setup.');setBusy(false);lock.current=false}
  }
  if(props.documentFirst)return <div className="space-y-8"><section><h1 className="page-title">Send Betti documents</h1><DocumentIntake/></section><Link href="/home" className="btn btn-primary">Go to your books</Link><section className="section-rule"><h2 className="section-heading">Keep your books up to date automatically</h2><p className="section-description">Connecting your accounts is recommended, but optional. You can keep using statements and receipts.</p><Link href="/settings/banking" className="btn btn-secondary mt-4">Connect accounts</Link></section></div>
  return <div className="space-y-12">
    <section aria-labelledby="connect-heading">
      {hasAccounts?<header><h1 id="connect-heading" className="text-3xl font-semibold tracking-tight text-[#17211d]">Your accounts are connected.</h1><p className="mt-4 leading-7 text-[#59665f]">One more thing before Betti gets to work.</p></header>:<><BettiPageIntro state="welcome" eyebrow="Let’s get started" title={<span id="connect-heading">Let’s connect your business accounts</span>}>
        WriteOffs works best when you connect the bank accounts and credit cards you use for your business.
      </BettiPageIntro>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#59665f]">Dedicated business accounts work best. If possible, use a checking account and credit cards that are only for your business.</p>
      <p className="mt-3 max-w-xl text-base leading-7 text-[#59665f]">If an account has both business and personal activity, that’s okay. Betti can help sort it out.</p></>}
      <div className="mt-7"><BankConnect {...props}/></div>
      {!hasAccounts&&<div className="mt-6 flex flex-wrap gap-x-6 gap-y-3"><Link href="/import" className="inline-flex min-h-11 items-center font-semibold text-[#243186]">Send Betti documents</Link></div>}
    </section>
    <section className="section-rule" aria-labelledby="receipts-heading"><h2 id="receipts-heading" className="section-heading">Have documents you want to add?</h2><p className="section-description">Send receipts and statements now or anytime later. Betti will figure out where they belong.</p><Link href="/import" className="btn btn-secondary mt-5">Send Betti documents</Link></section>
    <footer><p className="mb-5 text-[#59665f]">Betti will ask when there’s something worth reviewing. You can add more records anytime.</p><button className="btn btn-primary min-h-12" disabled={busy} onClick={()=>void finish()}>{busy?'Finishing setup…':'Start using WriteOffs'}</button><button className="ml-4 min-h-12 text-sm font-semibold text-[#243186]" disabled={busy} onClick={()=>void finish()}>I’ll add documents later</button>{error&&<p role="alert" className="mt-4 text-red-700">{error}</p>}</footer>
  </div>
}
