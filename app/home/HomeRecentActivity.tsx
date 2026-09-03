import Link from'next/link'
import type{HomeRecentActivity as Activity}from'../lib/home/recently-handled'

const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'})
const date=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'})
const day=(value:string)=>date.format(new Date(`${value}T12:00:00Z`))
const initial=(merchant:string)=>merchant.trim().charAt(0).toUpperCase()||'•'

export function HomeRecentActivity({activity}:{activity:Activity}){
 if(!activity.transactions.length&&!activity.receiptMatches.length)return null
 return <section className="home-recent" aria-labelledby="home-recent-heading"><div className="home-recent-heading"><p className="home-kicker">Recently handled by Betti</p><h2 id="home-recent-heading">A look at the latest</h2></div><div className={`home-recent-grid${activity.receiptMatches.length?' has-matches':''}`}>
  {activity.transactions.length>0&&<section className="home-recent-transactions" aria-labelledby="home-recent-transactions-heading"><div className="home-section-heading"><div><h3 id="home-recent-transactions-heading">Recent transactions</h3></div><Link href="/transactions">View all <span aria-hidden="true">→</span></Link></div><ul>{activity.transactions.map(item=><li key={item.id}><Link href={item.href}><span className="home-merchant-fallback" aria-hidden="true">{initial(item.merchant)}</span><span className="home-recent-main"><strong>{item.merchant}</strong><small><time dateTime={item.date}>{day(item.date)}</time> · {item.status}</small></span><b>{money.format(item.amountCents/100)}</b></Link></li>)}</ul></section>}
  {activity.receiptMatches.length>0&&<section className="home-recent-matches" aria-labelledby="home-recent-matches-heading"><div className="home-section-heading"><div><h3 id="home-recent-matches-heading">Recent receipt matches</h3></div><Link href="/receipts">View all <span aria-hidden="true">→</span></Link></div><ul>{activity.receiptMatches.map(item=><li key={item.id}><Link href={item.href}><span className="home-merchant-fallback" aria-hidden="true">{initial(item.merchant)}</span><span className="home-recent-main"><strong>{item.merchant}</strong><small>Matched to {money.format(Math.abs(item.amountCents)/100)} purchase · <time dateTime={item.date}>{day(item.date)}</time></small></span><span className="home-match-state">Matched</span></Link></li>)}</ul></section>}
 </div></section>
}
