'use client'

import { useId, useState } from 'react'

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Month-precision customer fact. Native select accessibility, no calendar/day
 * fiction. Only a complete, in-range YYYY-MM value crosses the command boundary. */
export function MonthYearField({ label, value, max, onChange, required = true }: {
  label: string; value: string; max: string; onChange: (value: string) => void; required?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useState(() => ({ source: value, year: value.slice(0, 4), month: value.slice(5, 7) }))
  if (draft.source !== value) setDraft({ source: value, year: value.slice(0, 4), month: value.slice(5, 7) })
  const maxYear = Number(max.slice(0, 4))
  function choose(part: 'year' | 'month', value: string) {
    const next = { ...draft, [part]: value }
    if (next.year && next.month && `${next.year}-${next.month}` > max) next.month = ''
    if (next.year && next.month) {
      next.source = `${next.year}-${next.month}`
      onChange(next.source)
    }
    setDraft(next)
  }
  return <fieldset className="wo-month-year">
    <legend>{label}</legend>
    <div>
      <label htmlFor={`${id}-month`}>Month</label>
      <select id={`${id}-month`} required={required} value={draft.month} onChange={e => choose('month', e.target.value)}>
        <option value="" disabled>Select month</option>
        {months.map((month, i) => { const value = String(i + 1).padStart(2, '0'); return <option key={month} value={value} disabled={Boolean(draft.year && `${draft.year}-${value}` > max)}>{month}</option> })}
      </select>
    </div>
    <div>
      <label htmlFor={`${id}-year`}>Year</label>
      <select id={`${id}-year`} required={required} value={draft.year} onChange={e => choose('year', e.target.value)}>
        <option value="" disabled>Select year</option>
        {Array.from({ length: maxYear - 1899 }, (_, i) => maxYear - i).map(year => <option key={year} value={year}>{year}</option>)}
      </select>
    </div>
  </fieldset>
}
