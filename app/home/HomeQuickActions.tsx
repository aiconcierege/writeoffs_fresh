import Link from'next/link'
import{ReceiptUploadAction}from'../receipts/ReceiptUploadAction'

type IconName='receipt'|'miles'|'money'|'invoice'
const paths:Record<IconName,React.ReactNode>={
 receipt:<><path d="M7 3.75h8.5a2 2 0 0 1 2 2v12.5l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V5.75a2 2 0 0 1 2-2Z"/><path d="M8.5 8h6M8.5 11.5h6"/></>,
 miles:<><path d="M5 17.5c2.5-5.5 5.5-9 12.5-11"/><path d="m14 5.5 3.5 1-1 3.5M7.5 17.5h.01"/></>,
 money:<><circle cx="11.5" cy="11" r="7.25"/><path d="M11.5 6.75v8.5M14 8.25h-3.6a1.65 1.65 0 0 0 0 3.3h2.2a1.65 1.65 0 0 1 0 3.3H9"/></>,
 invoice:<><path d="M6 3.75h9.5a2 2 0 0 1 2 2v12.5H6Z"/><path d="M9 8h5.5M9 11.5h5.5M9 15h3"/></>,
}
const Icon=({name}:{name:IconName})=><span className="home-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 23 23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg></span>

export function HomeQuickActions({business}:{business:boolean}){return <section className="home-quick" aria-labelledby="home-quick-heading"><h2 id="home-quick-heading">Quick actions</h2><div className="home-quick-list">
 <div className="home-shortcut home-shortcut-receipt"><Icon name="receipt"/><div><ReceiptUploadAction variant="home" mobileLabel="Take a picture" capture="environment"/><small>Add a photo or file</small><Link className="home-shortcut-receipt-options" href="/receipts">Choose an existing photo, file, or PDF</Link></div></div>
 <Link href="/mileage" className="home-shortcut"><Icon name="miles"/><span><strong>Add miles</strong><small>Track a trip</small></span></Link>
 <Link href={business?'/money':'/money?kind=spent'} className="home-shortcut"><Icon name="money"/><span><strong>Record money</strong><small>Income or expense</small></span></Link>
 <Link href="/invoices" className="home-shortcut"><Icon name="invoice"/><span><strong>Create invoice</strong><small>Send an invoice</small></span></Link>
 </div></section>}
