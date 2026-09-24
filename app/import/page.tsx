import Link from 'next/link'
import {DocumentIntake} from '../documents/DocumentIntake'
import {BettiPresence} from '../components/experience/BettiPresence'
import '../documents/documents.css'
export default function ImportPage(){return <main className="app-page"><section className="page-container document-workspace">
 <Link href="/home" className="inline-flex min-h-11 items-center font-semibold text-[#243186]">← Home</Link>
 <header className="document-intro"><div><p className="document-eyebrow">YOUR RECORDS, IN GOOD HANDS</p><h1>Send it to Betti.</h1><p>Statements, receipts, bills. Give me what you have, and I’ll work through the details.</p></div><BettiPresence state="question" className="document-betti" sizes="(max-width: 640px) 100px, 210px"/></header>
 <section className="document-work-surface" aria-label="Send and review documents"><DocumentIntake primary buttonLabel="Choose photos or files"/></section>
 <p className="document-footer">New records can arrive automatically, too. <Link href="/settings/banking">Connect accounts</Link> whenever you’re ready.</p>
 </section></main>}
