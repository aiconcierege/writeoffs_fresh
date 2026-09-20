import Image from 'next/image'
import {merchantMark} from '../../lib/merchant-marks'
export function MerchantIdentity({merchant,date,amountCents,compact=false,id,detail}:{id?:string;detail?:string;merchant:string;date?:string|null;amountCents?:number|null;compact?:boolean}){
 const mark=merchantMark(merchant)
 return <div id={id} className={`betti-merchant${compact?' betti-merchant-compact':''}`}>{mark&&<span className="betti-merchant-mark" aria-hidden="true"><Image src={mark.src} alt="" width={44} height={44}/></span>}
 <div><p className="betti-merchant-name">{merchant}</p>{(detail||date||amountCents!=null)&&<p className="betti-merchant-meta">{detail}{detail&&(date||amountCents!=null)?' · ':''}{date&&<time dateTime={date}>{new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`))}</time>}{date&&amountCents!=null?' · ':''}{amountCents!=null&&new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Math.abs(amountCents)/100)}</p>}</div></div>
}
