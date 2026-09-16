import Link from 'next/link'
import {DocumentIntake} from '../documents/DocumentIntake'
export default function ImportPage(){return <main className="app-page"><section className="page-container max-w-3xl"><Link href="/home" className="inline-flex min-h-11 items-center font-semibold text-[#243186]">← Home</Link><h1 className="page-title mt-4">Send Betti documents</h1><div className="mt-5"><DocumentIntake/></div><Link href="/transactions" className="mt-6 inline-flex min-h-11 items-center font-semibold text-[#243186]">View transactions →</Link></section></main>}
