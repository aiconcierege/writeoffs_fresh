import Link from'next/link'
import{ReceiptUploadAction}from'../receipts/ReceiptUploadAction'

const Icon=({children}:{children:string})=><span className="home-shortcut-icon" aria-hidden="true">{children}</span>

export function HomeQuickActions({business}:{business:boolean}){return <section className="home-quick" aria-labelledby="home-quick-heading"><h2 id="home-quick-heading">Quick actions</h2><div className="home-quick-list">
 <div className="home-shortcut home-shortcut-receipt"><Icon>▱</Icon><div><ReceiptUploadAction variant="home" mobileLabel="Take a picture" capture="environment"/><small>Add a photo or file</small><Link className="home-shortcut-receipt-options" href="/receipts">Choose an existing photo, file, or PDF</Link></div></div>
 <Link href="/mileage" className="home-shortcut"><Icon>↗</Icon><span><strong>Add miles</strong><small>Track a trip</small></span></Link>
 <Link href={business?'/money':'/money?kind=spent'} className="home-shortcut"><Icon>＋</Icon><span><strong>Record money</strong><small>Income or expense</small></span></Link>
 <Link href="/invoices" className="home-shortcut"><Icon>□</Icon><span><strong>Create invoice</strong><small>Send an invoice</small></span></Link>
 </div></section>}
