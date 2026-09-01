import Link from 'next/link'
import { type HomeOperatingStatus as Status } from '../lib/home/operating-status-model'

export function HomeOperatingStatus({ status }: { status: Status }) {
  if(status.hasConnectedAccounts)return null
  return <div className="home-operating-action"><Link href="/get-started" className="home-check-action">Connect an account <span aria-hidden="true">→</span></Link></div>
}
