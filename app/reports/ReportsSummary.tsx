'use client'

import {SourceCoverageNotice} from '../components/SourceCoverageNotice'
import type {SourceCoverage} from '../lib/bookkeeping/source-coverage'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { reportPeriod, type ReportPeriod } from './report-period'
import './reports.css'

type SummaryData = {
  sourceCoverage?:SourceCoverage|null
  ownerPersonalUseCents?: number
  businessIncomeCents: number
  businessExpensesCents: number
  businessProfitCents: number
  estimatedDeductionsCents: number | null
  businessMilesMilli: number
  mileageDeductionCents: null
  mileageTaxTreatmentStatus: 'facts_only' | 'not_applicable'
  uncategorizedBusinessExpensesCents: number
  categoryTotals: { categoryKey: string; categoryLabel: string; amountCents: number; transactionCount: number }[]
  completeness: { isComplete: boolean; unresolvedRecordCount: number; unresolvedTaxTreatmentCount: number }
  contractorSummaries: { id:string;displayName:string;totalPaidCents:number;paymentMethods:string[];w9Status:string;awareness:string }[]
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (cents: number) => usd.format(cents / 100)

export function ReportsSummary({scope,readOnly,annual}:{scope:'expenses'|'business';readOnly:boolean;annual?:ReactNode}) {
  const [kind, setKind] = useState<ReportPeriod>('ytd')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10))
  const period = reportPeriod(kind, anchor)
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [loadedPeriod, setLoadedPeriod] = useState('')
  const periodKey = `${period.start}:${period.end}`
  const pending = loading || (!failed && loadedPeriod !== periodKey)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setFailed(false)
    fetch(`/api/reports/summary?start=${period.start}&end=${period.end}`, {cache:'no-store', signal:controller.signal})
      .then(async response => { if (!response.ok) throw new Error('report_unavailable'); return response.json() })
      .then(value => { if (!controller.signal.aborted) { setData(value); setLoadedPeriod(`${period.start}:${period.end}`) } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [period.start, period.end, retry])
  const business = scope === 'business'
  return <div className="reports-page wo-experience">
    <header className="reports-heading"><div><p className="reports-eyebrow">Your business, in view</p><h1>Reports</h1></div><Link className="reports-link" href="#tax-time">Tax-time & exports <span aria-hidden="true">↓</span></Link></header>
    {readOnly && <p className="reports-note">Historical records · read only</p>}
    <div className="reports-controls"><div role="group" aria-label="Report period" className="reports-periods">{([['ytd','Year to date'],['month','Monthly'],['quarter','Quarterly'],['annual','Annual']] as const).map(([value,label]) => <button key={value} aria-pressed={kind===value} onClick={()=>{setKind(value);if(value==='ytd'){const today=new Date().toISOString().slice(0,10);setAnchor(period.year===Number(today.slice(0,4))?today:`${period.year}-12-31`)}}}>{label}</button>)}</div>
      <div className="reports-date-controls">
        {kind==='month'&&<label className="reports-month">Month<select aria-label="Reporting month" value={anchor.slice(5,7)} onChange={e=>setAnchor(`${period.year}-${e.target.value}-01`)}>{Array.from({length:12},(_,m)=><option key={m} value={String(m+1).padStart(2,'0')}>{new Date(Date.UTC(2026,m,1)).toLocaleDateString('en-US',{month:'long',timeZone:'UTC'})}</option>)}</select></label>}
        {kind==='quarter'&&<label className="reports-month">Quarter<select aria-label="Reporting quarter" value={Math.floor((Number(anchor.slice(5,7))-1)/3)} onChange={e=>setAnchor(`${period.year}-${String(Number(e.target.value)*3+1).padStart(2,'0')}-01`)}>{[0,1,2,3].map(q=><option key={q} value={q}>Q{q+1}</option>)}</select></label>}
        <label className="reports-month">Year<select aria-label="Reporting year" value={period.year} onChange={e=>{const today=new Date().toISOString().slice(0,10);setAnchor(kind==='ytd'?(e.target.value===today.slice(0,4)?today:`${e.target.value}-12-31`):`${e.target.value}-${anchor.slice(5,7)}-01`)}}>{Array.from({length:7},(_,i)=>new Date().getUTCFullYear()-i).map(year=><option key={year} value={year}>{year}</option>)}</select></label>
      </div>
    </div>
    <div className="reports-period-caption"><span>{period.label}</span><span>Working books</span></div>
    <div aria-busy={pending}>
    {pending ? <div className="reports-loading" role="status"><span className="sr-only">Loading report</span><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div>
    : failed || !data ? <div role="alert" className="reports-error"><h2>Your report couldn’t load.</h2><p>Please try again. Your saved records haven’t changed.</p><button className="btn btn-primary" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>
    : <>
      <SourceCoverageNotice coverage={data.sourceCoverage??null}/>
      <section aria-label="Financial summary" className="reports-summary"><dl>
        {business&&<div><dt>Business income</dt><dd>{money(data.businessIncomeCents)}</dd></div>}
        <div><dt>Business expenses</dt><dd>{money(data.businessExpensesCents)}</dd></div>
        {business&&<div className="reports-profit"><dt>Estimated profit</dt><dd>{money(data.businessProfitCents)}</dd></div>}
      </dl><p>Based on your available records. Tax deductions may differ.</p></section>
      <div className="reports-body">
        <section className="reports-expenses" aria-labelledby="category-heading"><div className="reports-section-heading"><div><p className="reports-eyebrow">Business expenses</p><h2 id="category-heading">Where the money went</h2></div><span className="reports-section-amount">{money(data.businessExpensesCents)}</span></div>
          <dl className="reports-rows">{data.categoryTotals.map(row=><div key={row.categoryKey}><dt>{row.categoryLabel}</dt><dd>{money(row.amountCents)}</dd></div>)}
            {data.uncategorizedBusinessExpensesCents!==0&&<div><dt>Still being categorized</dt><dd>{money(data.uncategorizedBusinessExpensesCents)}</dd></div>}
            {data.categoryTotals.length===0&&data.uncategorizedBusinessExpensesCents===0&&<div className="reports-empty"><dt>No business expenses to show yet.</dt><dd><Link href="/import">Send documents →</Link></dd></div>}
            <div className="reports-total"><dt>Total business expenses</dt><dd>{money(data.businessExpensesCents)}</dd></div>
          </dl>
        </section>
        <aside className="reports-context" aria-label="Income and other activity">
          {business&&<section><p className="reports-eyebrow">Business income</p><h2>Money coming in</h2><p className="reports-context-value">{money(data.businessIncomeCents)}</p><p className="reports-note">Business income for this period. Transfers and money you added aren’t income.</p></section>}
          {(data.ownerPersonalUseCents??0)!==0&&<section><h2>Money used personally</h2><p className="reports-context-value">{money(data.ownerPersonalUseCents??0)}</p><p className="reports-note">Separate from your business income, expenses and profit.</p></section>}
          {data.businessMilesMilli>0&&<section><h2>Business driving</h2><p className="reports-context-value">{(data.businessMilesMilli/1000).toLocaleString('en-US',{maximumFractionDigits:3})} <small>miles</small></p><p className="reports-note">Your recorded business miles. Any deduction is tracked separately.</p><Link className="reports-link" href="/mileage">View mileage →</Link></section>}
          {data.estimatedDeductionsCents!=null&&<section><h2>Estimated deductions</h2><p className="reports-context-value">{money(data.estimatedDeductionsCents)}</p><p className="reports-note">Tax-time amounts can differ from your working expenses.</p></section>}
        </aside>
      </div>
      {data.contractorSummaries.some(row=>row.totalPaidCents>0)&&<section className="reports-section"><div className="reports-section-heading"><h2>People you hired</h2><Link className="reports-link" href="/contractors">View details →</Link></div><dl className="reports-rows">{data.contractorSummaries.filter(row=>row.totalPaidCents>0).map(row=><div key={row.id}><dt>{row.displayName}</dt><dd>{money(row.totalPaidCents)}</dd></div>)}</dl></section>}
      {(data.completeness.unresolvedRecordCount>0||data.completeness.unresolvedTaxTreatmentCount>0)&&<section className="reports-review"><div><h2>Still being reviewed</h2>{data.completeness.unresolvedRecordCount>0&&<p>{data.completeness.unresolvedRecordCount} {data.completeness.unresolvedRecordCount===1?'transaction needs':'transactions need'} more detail.</p>}{data.completeness.unresolvedTaxTreatmentCount>0&&<p>Some tax-time details are still being checked. Your working amounts are shown above.</p>}</div><Link className="reports-link" href="/check-in">Work with Betti →</Link></section>}
    </>}
    </div>
    <section id="tax-time" className="reports-tax-time"><div className="reports-section-heading"><div><p className="reports-eyebrow">For you or your tax preparer</p><h2>Tax-time & exports</h2><p className="reports-note">Use your records with a tax preparer or while preparing your own return.</p></div></div>
      <div className="reports-export-actions"><Link className="btn btn-primary" href={`/reports/tax-time?year=${period.year}`}>View {period.year} tax-time summary</Link><a className="btn btn-secondary" href={`/api/export/csv?year=${period.year}`}>Download {period.year} transactions · CSV</a></div>
      {annual&&<details className="reports-annual"><summary>Previous-year readiness</summary>{annual}</details>}
    </section>
  </div>
}
