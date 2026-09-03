import Link from 'next/link'
import { type HomeOperatingStatus as Status } from '../lib/home/operating-status-model'

export function HomeOperatingStatus({ status, outstandingDocumentation = 0 }: { status: Status; outstandingDocumentation?: number }) {
  if(status.hasConnectedAccounts&&outstandingDocumentation===0)return null
  return <section className="home-follow-up" aria-labelledby="home-follow-up-heading"><div>
    <p className="home-kicker">Still on your list</p><h2 id="home-follow-up-heading">A few things to come back to</h2>
    <p>These are follow-ups, not bookkeeping work you need to do right now.</p>
  </div><ul>
    {outstandingDocumentation>0&&<li><Link href="/transactions"><span><strong>{outstandingDocumentation} {outstandingDocumentation===1?'receipt':'receipts'}</strong><small>Still needed for stronger documentation</small></span><span aria-hidden="true">→</span></Link></li>}
    {!status.hasConnectedAccounts&&<li><Link href="/get-started"><span><strong>Connect an account</strong><small>Share business activity with Betti</small></span><span aria-hidden="true">→</span></Link></li>}
  </ul></section>
}
