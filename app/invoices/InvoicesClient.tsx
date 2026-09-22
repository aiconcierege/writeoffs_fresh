'use client'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useRef,useState} from 'react'
import {AuthenticatedPage} from '../components/ui'
import {WorkspaceDisclosure,WorkspaceField,WorkspaceGroup} from '../components/Workspace'

const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'})
const today=()=>new Date().toISOString().slice(0,10)
const date=(value:unknown)=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${String(value)}T00:00:00Z`)):null

export function InvoicesClient({initialInvoices}:{initialInvoices:Record<string,unknown>[]}) {
 const router=useRouter(),key=useRef(crypto.randomUUID()),customer=useRef<HTMLInputElement>(null),create=useRef<HTMLButtonElement>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 const hasInvoices=initialInvoices.length>0,[composing,setComposing]=useState(!hasInvoices)
 function openComposer(){setComposing(true);requestAnimationFrame(()=>customer.current?.focus())}
 function closeComposer(){setComposing(false);requestAnimationFrame(()=>create.current?.focus())}
 return <AuthenticatedPage className="invoices-page signature-page" eyebrow="Invoices" title="Get paid for your work." description={<>Create an invoice for your customer.<span className="invoice-introduction">I’ll add the income to your books when you get paid.</span></>} actions={hasInvoices&&!composing?<button ref={create} className="btn btn-primary invoice-create-toggle" onClick={openComposer}>+ Create invoice</button>:undefined}>
  {hasInvoices&&<section hidden={composing} aria-labelledby="invoice-history-heading" className="invoice-history workspace-surface">
   <div className="workspace-section-heading"><h2 id="invoice-history-heading">Your invoices</h2><span>{initialInvoices.length} {initialInvoices.length===1?'invoice':'invoices'}</span></div>
   <div className="invoice-list">{initialInvoices.map(invoice=><Link key={String(invoice.id)} href={`/invoices/${invoice.id}`} className="invoice-row">
    <div className="invoice-customer"><span className="invoice-reference">{String(invoice.invoice_number)}</span><strong>{String(invoice.customer_name)}</strong><p>{String(invoice.description)}</p><span>{invoice.issue_date?`Issued ${date(invoice.issue_date)}`:''}{invoice.due_date?` · Due ${date(invoice.due_date)}`:''}</span></div>
    <div className="invoice-value"><strong>{money.format(Number(invoice.amount_cents)/100)}</strong><span>{status(String(invoice.status))}</span><span aria-hidden="true" className="invoice-row-arrow">↗</span></div>
   </Link>)}</div>
  </section>}
  <section hidden={!composing} className="invoice-composer workspace-surface" aria-labelledby="invoice-composer-heading">
   <header className="composer-heading"><div><p className="workspace-kicker">Make it official</p><h2 id="invoice-composer-heading">New invoice</h2></div>{hasInvoices&&<button type="button" className="workspace-text-action" onClick={closeComposer}>Back to invoices <span aria-hidden="true">×</span></button>}</header>
   <form onSubmit={async event=>{
    event.preventDefault();if(busy)return;setBusy(true);setError(null)
    try{const body=Object.fromEntries(new FormData(event.currentTarget)),response=await fetch('/api/invoices',{method:'POST',headers:{'content-type':'application/json','idempotency-key':`invoice-${key.current}`},body:JSON.stringify(body)}),data=await response.json().catch(()=>({}))
     if(!response.ok){setError(data.error??'Invoice could not be created.');return}router.push(`/invoices/${data.id}`)
    }catch{setError('Invoice could not be created. Please try again.')}finally{setBusy(false)}
   }}>
    <div className="invoice-document-grid">
     <WorkspaceGroup title="Bill to" className="invoice-bill-to">
      <WorkspaceField label="Customer"><input ref={customer} required name="customerName" className="field" autoComplete="organization" placeholder="Customer or business name"/></WorkspaceField>
      <WorkspaceDisclosure title="Add customer email"><WorkspaceField label="Customer email" hint="optional"><input name="customerEmail" type="email" className="field" autoComplete="email" placeholder="name@example.com"/></WorkspaceField></WorkspaceDisclosure>
     </WorkspaceGroup>
     <div className="document-amount"><label htmlFor="invoice-amount">Amount</label><div><span aria-hidden="true">$</span><input id="invoice-amount" aria-label="Amount in US dollars" required name="amount" inputMode="decimal" placeholder="0.00"/></div><span className="document-currency">USD</span></div>
     <WorkspaceGroup title="For" className="invoice-work">
      <WorkspaceField label="What was the work?"><input required name="description" className="field" placeholder="Describe the work you did"/></WorkspaceField>
      <WorkspaceDisclosure title="Add a job or project"><WorkspaceField label="Job or project" hint="optional"><input name="jobLabel" className="field"/></WorkspaceField></WorkspaceDisclosure>
     </WorkspaceGroup>
     <WorkspaceGroup title="When" className="invoice-dates"><div className="workspace-field-pair">
      <WorkspaceField label="Issue date"><input required name="issueDate" type="date" max={today()} defaultValue={today()} className="field"/></WorkspaceField>
      <WorkspaceField label="Due date" hint="optional"><input name="dueDate" type="date" className="field"/></WorkspaceField>
     </div></WorkspaceGroup>
    </div>
    <div className="composer-footer">
     <WorkspaceDisclosure title="Additional details"><div className="workspace-field-pair"><WorkspaceField label="Address or location" hint="optional"><input name="location" className="field"/></WorkspaceField><WorkspaceField label="Note" hint="optional"><textarea name="note" rows={2} className="field"/></WorkspaceField></div></WorkspaceDisclosure>
     {error&&<p role="alert" className="notice notice-error">{error}</p>}
     <div className="composer-submit"><p>Income is recorded when you get paid.</p><button disabled={busy} className="btn btn-primary">{busy?'Creating…':<>Create invoice <span aria-hidden="true">→</span></>}</button></div>
    </div>
   </form>
  </section>
 </AuthenticatedPage>
}
function status(value:string){return value==='paid'?'Paid':value==='canceled'?'Canceled':'Awaiting payment'}
