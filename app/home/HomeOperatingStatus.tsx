import Link from 'next/link'
import { type HomeOperatingStatus as Status } from '../lib/home/operating-status-model'

export function HomeOperatingStatus({ status, outstandingDocumentation = 0 }: { status: Status; outstandingDocumentation?: number }) {
  if(status.hasConnectedAccounts&&outstandingDocumentation===0)return null
  return <div className="home-operating-action">
    {!status.hasConnectedAccounts&&<Link href="/get-started" className="home-check-action">Connect an account <span aria-hidden="true">→</span></Link>}
    {outstandingDocumentation>0&&<p><Link href="/transactions" className="home-check-action">{outstandingDocumentation} {outstandingDocumentation===1?'receipt is':'receipts are'} still needed <span aria-hidden="true">→</span></Link></p>}
  </div>
}
