import Image from 'next/image'
import {merchantMark} from '../../lib/merchant-marks'
export function MerchantIdentity({merchant,date,amountCents,compact=false,id,detail}:{id?:string;detail?:string;merchant:string;date?:string|null;amountCents?:number|null;compact?:boolean}){
 const mark=merchantMark(merchant)
 return <div id={id} className={`betti-merchant${compact?' betti-merchant-compact':''}`}><span className="betti-merchant-mark" aria-hidden="true">{mark?<Image src={mark.src} alt="" width={44} height={44}/>:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 9h16v11H4zM3 9l2-5h14l2 5M8 20v-7h5v7M3 9c0 4 4 4 4 0 0 4 5 4 5 0 0 4 5 4 5 0 0 4 4 4 4 0"/></svg>}</span>
 <div><p className="betti-merchant-name">{merchant}</p>{(detail||date||amountCents!=null)&&<p className="betti-merchant-meta">{detail}{detail&&(date||amountCents!=null)?' · ':''}{date&&<time dateTime={date}>{new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`))}</time>}{date&&amountCents!=null?' · ':''}{amountCents!=null&&new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Math.abs(amountCents)/100)}</p>}</div></div>
}
