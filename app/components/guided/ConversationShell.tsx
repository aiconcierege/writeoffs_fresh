import Link from 'next/link'
import {BettiIllustration,type BettiState} from '../BettiIllustration'
import {returnLabel,safeReturnTo} from '../../lib/navigation-context'
import './guided.css'
export function ConversationShell({children,context='Work with Betti',progress='One thing at a time',returnTo='/home',state='question',notice}:{children:React.ReactNode;context?:string;progress?:string;returnTo?:string;state?:BettiState;notice?:string}){
 const back=safeReturnTo(returnTo,'/home')
 return <div className="betti-work"><nav className="betti-work-nav" aria-label="Return to your books"><Link href={back}>← {returnLabel(back)}</Link><span aria-live="polite">{progress}</span></nav>
  <div className="betti-conversation"><aside className="betti-guide"><div className="betti-guide-intro"><p className="betti-eyebrow">Betti · Your bookkeeper</p><p className="betti-guide-note">You bring the facts.<br/>I’ll take care of the books.</p></div><BettiIllustration state={state} className={`betti-guide-art${state==='question'?' betti-guide-engaged':''}`} priority sizes="(max-width: 639px) 145px, (max-width: 900px) 200px, 290px"/></aside>
   <section className="betti-conversation-body" aria-label="Work with Betti"><p className="betti-workstream">{context}</p>{notice&&<p className="betti-saved" role="status">{notice}</p>}{children}</section>
  </div>
 </div>
}
export function SelectionCard({children,selected,onClick,disabled=false}:{children:React.ReactNode;selected?:boolean;onClick:()=>void;disabled?:boolean}){
 return <button type="button" className="betti-choice" aria-pressed={selected} onClick={onClick} disabled={disabled}>{children}<span aria-hidden="true">{selected?'✓':'→'}</span></button>
}
