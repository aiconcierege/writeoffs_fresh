import Link from 'next/link'

export type WriteoffMonth = { label: string; count: number }

export function monthlyWriteoffRhythm(items: { occurredOn: string }[], year: number): WriteoffMonth[] {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const counts = Array.from({ length: 12 }, () => 0)
  for (const item of items) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(item.occurredOn)
    if (!match || Number(match[1]) !== year) continue
    const month = Number(match[2]) - 1
    if (month >= 0 && month < 12) counts[month] += 1
  }
  return counts.map((count, index) => ({ label: monthNames[index], count }))
}

export function WriteoffRhythm({ months }: { months: WriteoffMonth[] }) {
  const visible = months.slice(0, Math.max(1, months.findLastIndex((month) => month.count > 0) + 1))
  const max = Math.max(1, ...visible.map((month) => month.count))
  return <figure className="home-rhythm" aria-labelledby="writeoff-rhythm-title">
    <figcaption id="writeoff-rhythm-title" className="home-rhythm-title">Writeoffs found by month</figcaption>
    <div className="home-rhythm-bars" aria-hidden="true">{visible.map((month) =>
      <div key={month.label} className="home-rhythm-column">
        <span className="home-rhythm-value">{month.count}</span>
        <span className="home-rhythm-bar" style={{ height: `${Math.max(8, Math.round(month.count / max * 72))}px` }}/>
        <span className="home-rhythm-label">{month.label}</span>
      </div>)}</div>
    <p className="sr-only">{visible.map((month) => `${month.label}: ${month.count}`).join('. ')}</p>
  </figure>
}

const paths: Record<string, string> = {
  transactions: 'M4 7h16M4 12h10M4 17h13M18 14v6m-3-3h6',
  receipts: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6',
  mileage: 'M5 18a7 7 0 1 1 14 0M8 18h8m-4-4 3-4',
  contractors: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 2a3 3 0 1 0 0-6m-14 14v-2a6 6 0 0 1 12 0v2m2-7a5 5 0 0 1 5 5v2',
  deductions: 'M12 3v18m5-14.5c0-2-2.2-3.5-5-3.5S7 4.5 7 7s2 3.2 5 3.5 5 1.7 5 4.5-2.2 5-5 5-5-1.5-5-3.5',
  reports: 'M5 21V10m7 11V3m7 18v-7',
  invoices: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h4',
}

export function RecordIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.reports}/></svg>
}

export function RecordIndex({ areas }: { areas: readonly (readonly [string, string, string, string])[] }) {
  return <nav aria-label="Business records" className="home-record-index">{areas.map(([href, title, description, icon]) =>
    <Link key={href} href={href} className="home-record-link">
      <span className="home-record-icon"><RecordIcon name={icon}/></span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <span className="home-record-arrow" aria-hidden="true">→</span>
    </Link>)}</nav>
}

export function DocumentationStrip({ documented, undocumented, processing }: { documented: number; undocumented: number; processing: number }) {
  const total = documented + undocumented
  const width = (value: number) => total > 0 ? `${value / total * 100}%` : '0%'
  return <div>
    <div className="home-document-strip" role="img" aria-label={`${documented} potential writeoffs have documentation and ${undocumented} do not currently have documentation. ${processing} uploaded receipts are still being worked on.`}>
      <span className="home-document-documented" style={{ width: width(documented) }}/>
      <span className="home-document-undocumented" style={{ width: width(undocumented) }}/>
    </div>
    <dl className="home-document-legend">
      <div><dt><i className="bg-[#178368]"/>Documented</dt><dd>{documented}</dd></div>
      <div><dt><i className="bg-[#f2a91d]"/>Still being worked on</dt><dd>{processing}</dd></div>
      <div><dt><i className="bg-[#d7dcd8]"/>Without documentation</dt><dd>{undocumented}</dd></div>
    </dl>
  </div>
}

export function FinancialRelationship({ income, expenses, profit, business }: { income: number; expenses: number; profit: number; business: boolean }) {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  if (!business) return <div className="home-financial-expenses"><span>Business expenses</span><strong>{money.format(expenses / 100)}</strong><div className="home-financial-line"/></div>
  const max = Math.max(1, income, expenses, Math.max(0, profit))
  const metrics = [
    ['Business income', income, '#178368'],
    ['Business expenses', expenses, '#f0a21a'],
    ['Estimated profit', profit, '#243186'],
  ] as const
  return <div className="home-financial-grid">{metrics.map(([label, value, color]) => <div key={label} className="home-financial-metric">
    <span>{label}</span><strong>{money.format(value / 100)}</strong>
    <div className="home-financial-track"><i style={{ width: `${Math.max(3, Math.abs(value) / max * 100)}%`, backgroundColor: color }}/></div>
  </div>)}</div>
}
