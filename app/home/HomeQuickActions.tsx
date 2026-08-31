import Link from'next/link'
import{ReceiptUploadAction}from'../receipts/ReceiptUploadAction'

const Icon=({children}:{children:string})=><span className="home-shortcut-icon" aria-hidden="true">{children}</span>

export function HomeQuickActions({business}:{business:boolean}){return <section className="home-quick" aria-labelledby="home-quick-heading"><div><p className="home-kicker">Shortcuts</p><h2 id="home-quick-heading">Get things done</h2></div><div className="home-quick-list">
 <div className="home-shortcut home-shortcut-receipt"><Icon>▱</Icon><div><ReceiptUploadAction variant="home" mobileLabel="Take a picture" capture="environment"/><small>Add a photo or file</small></div></div>
 <Link href="/mileage" className="home-shortcut"><Icon>↗</Icon><span><strong>Add miles</strong><small>Track business miles</small></span></Link>
 <Link href={business?'/money':'/money?kind=spent'} className="home-shortcut"><Icon>＋</Icon><span><strong>Record money</strong><small>Log income or an expense</small></span></Link>
 <Link href="/invoices" className="home-shortcut"><Icon>□</Icon><span><strong>Create invoice</strong><small>Send a professional invoice</small></span></Link>
 </div><Link className="home-choose-receipt" href="/receipts">Choose an existing photo, file, or PDF</Link></section>}
