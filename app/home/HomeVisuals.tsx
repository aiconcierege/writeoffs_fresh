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
  const width = 520, height = 104, left = 10, right = 10, top = 12, bottom = 18
  const x = (index: number) => visible.length === 1 ? width / 2
    : left + index * ((width - left - right) / (visible.length - 1))
  const y = (count: number) => top + (max - count) / max * (height - top - bottom)
  const points = visible.map((month, index) => `${x(index)},${y(month.count)}`).join(' ')
  const area = visible.length > 1
    ? `M ${x(0)} ${height - bottom} L ${points.replaceAll(',', ' ')} L ${x(visible.length - 1)} ${height - bottom} Z`
    : ''
  return <figure className="home-rhythm" aria-labelledby="writeoff-rhythm-title">
    <figcaption id="writeoff-rhythm-title" className="home-rhythm-title">Writeoffs found by month</figcaption>
    <svg className="home-rhythm-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="writeoff-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00b889" stopOpacity=".3"/><stop offset="1" stopColor="#00b889" stopOpacity="0"/></linearGradient></defs>
      {area && <path d={area} fill="url(#writeoff-area)"/>}
      {visible.length > 1 && <polyline points={points} fill="none" stroke="#178368" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>}
      {visible.map((month, index) => <circle key={month.label} cx={x(index)} cy={y(month.count)} r={index === visible.length - 1 ? 6 : 4} fill={index === visible.length - 1 ? '#243186' : '#fffaf3'} stroke={index === visible.length - 1 ? '#243186' : '#178368'} strokeWidth="3" vectorEffect="non-scaling-stroke"/>)}
    </svg>
    <div className="home-rhythm-months" aria-hidden="true">{visible.map((month) => <span key={month.label}>{month.label}</span>)}</div>
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
  return <div role="group" aria-label="Documentation status">
    <dl className="home-document-states">
      <div className="home-document-connected"><dt><span aria-hidden="true">✓</span>Receipts connected</dt><dd>{documented}</dd><small>Supporting these expenses</small></div>
      <div className="home-document-open"><dt><span aria-hidden="true">○</span>Without a receipt yet</dt><dd>{undocumented}</dd><small>Still included in your records</small></div>
      {processing > 0 && <div className="home-document-processing-state"><dt><span aria-hidden="true">•••</span>Being worked on</dt><dd>{processing}</dd><small>Uploaded receipts in progress</small></div>}
    </dl>
  </div>
}

export function FinancialRelationship({ income, expenses, profit, business }: { income: number; expenses: number; profit: number; business: boolean }) {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  if (!business) return <div className="home-financial-expenses"><span>Business expenses</span><strong>{money.format(expenses / 100)}</strong><div className="home-financial-line"/></div>
  return <div className="home-financial-flow" role="img" aria-label={`${money.format(income / 100)} in business income, minus ${money.format(expenses / 100)} in business expenses, leaves approximately ${money.format(profit / 100)} in estimated business profit.`}>
    <div className="home-financial-node home-financial-income"><span>Came in</span><small>Business income</small><strong>{money.format(income / 100)}</strong></div>
    <span className="home-financial-operator" aria-hidden="true">−</span>
    <div className="home-financial-node home-financial-spent"><span>Spent</span><small>On the business</small><strong>{money.format(expenses / 100)}</strong></div>
    <span className="home-financial-operator" aria-hidden="true">=</span>
    <div className="home-financial-node home-financial-profit"><span>What’s left</span><small>Estimated business profit</small><strong>{money.format(profit / 100)}</strong></div>
  </div>
}
