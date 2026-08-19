/* File: app/import/page.tsx
 * Version: v1.2 (shows server error details; includes CSV template link + notes)
 * Date: 2025-10-30
 * Notes:
 * - Client-only page for CSV upload → preview → header mapping → submit to /api/import/csv
 * - Minimal CSV parser supports common cases (quoted cells, commas).
 */
'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type Row = Record<string, string>

type Mapping = {
  date: string | null
  description: string | null
  amount: string | null
}

type Pack = 'general' | 'realtor'

export default function ImportPage() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [pack, setPack] = useState<Pack>('general')
  const [mapping, setMapping] = useState<Mapping>({ date: null, description: null, amount: null })
  const [status, setStatus] = useState<'idle' | 'parsing' | 'ready' | 'submitting' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // --- CSV parsing (simple but robust for common cases) ---
  function parseCsv(text: string): Row[] {
    // Normalize newlines
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = text.split('\n').filter(l => l.trim() !== '')
    if (lines.length === 0) return []
    const headerCells = splitCsvLine(lines[0])
    const result: Row[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i])
      const row: Row = {}
      for (let c = 0; c < headerCells.length; c++) {
        const key = headerCells[c]?.trim() || `col_${c + 1}`
        row[key] = (cells[c] ?? '').trim()
      }
      result.push(row)
    }
    return result
  }

  function splitCsvLine(line: string): string[] {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { // escaped quote
          cur += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    out.push(cur)
    return out
  }

  // --- Heuristics to guess mappings from header names ---
  function guessMapping(hdrs: string[]): Mapping {
    const lc = hdrs.map(h => h.toLowerCase())
    const find = (...candidates: string[]) => {
      for (const target of candidates) {
        const idx = lc.findIndex(h => h === target || h.includes(target))
        if (idx >= 0) return hdrs[idx]
      }
      return null
    }
    const date = find('date', 'transaction_date', 'posted_date')
    const description = find('description', 'vendor', 'payee', 'memo', 'name', 'detail')
    // Prefer 'amount'; if there are 'debit'/'credit', pick amount and we’ll interpret sign on server
    const amount = find('amount', 'debit', 'credit')
    return { date, description, amount }
  }

  function onFileSelect(file: File) {
    setStatus('parsing')
    setMessage(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onerror = () => {
      setStatus('error')
      setMessage('Could not read file.')
    }
    reader.onload = () => {
      try {
        const text = String(reader.result || '')
        const parsed = parseCsv(text)
        if (parsed.length === 0) {
          setHeaders([])
          setRows([])
          setStatus('error')
          setMessage('No rows found in CSV.')
          return
        }
        const hdrs = Object.keys(parsed[0])
        setHeaders(hdrs)
        setRows(parsed)
        setMapping(guessMapping(hdrs))
        setStatus('ready')
      } catch (error: unknown) {
        setStatus('error')
        setMessage(errorMessage(error, 'Failed to parse CSV.'))
      }
    }
    reader.readAsText(file)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0])
    }
  }

  // --- Submit to backend; show full error details if any ---
  async function onSubmit() {
    if (!rows.length) return
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setMessage('Please map Date, Description, and Amount before importing.')
      return
    }
    setStatus('submitting')
    setMessage(null)
    try {
      const preview = rows.slice(0, 1000) // safety cap; server can handle all but we keep payload sane
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack, mapping, rows: preview })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        const detail = data?.details ? ` — ${String(data.details).slice(0, 300)}` : ''
        throw new Error((data?.error || 'Import failed') + detail)
      }
      setStatus('done')
      setMessage(`Imported ${data?.imported ?? 0} rows.`)
    } catch (error: unknown) {
      setStatus('error')
      setMessage(errorMessage(error, 'Import failed.'))
    }
  }

  const preview = useMemo(() => rows.slice(0, 10), [rows])

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Import transactions (CSV)</h1>
            <p className="mt-1 text-sm text-neutral-700">
              Drop a CSV exported from your bank/credit card or broker fees. We’ll map columns and import your expenses.
            </p>
          </div>
          <Link href="/transactions" className="text-sm underline">
            View transactions
          </Link>
        </div>

        {/* Pack selector */}
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-neutral-600">Industry preset</div>
          <div className="mt-2 flex gap-3">
            <button
              onClick={() => setPack('general')}
              className={`rounded-xl px-3 py-1.5 text-sm ${pack === 'general' ? 'btn-primary text-white' : 'btn-secondary'}`}
              aria-pressed={pack === 'general'}
            >
              General
            </button>
            <button
              onClick={() => setPack('realtor')}
             className={`rounded-xl px-3 py-1.5 text-sm ${pack === 'realtor' ? 'btn-primary text-white' : 'btn-secondary'}`}
              aria-pressed={pack === 'realtor'}
            >
              Realtor
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            This just tunes suggestions (e.g., Zillow → Advertising). You can change it later in Settings.
          </p>
        </div>

        {/* Uploader */}
        <div
          className="mt-6 rounded-2xl border-2 border-dashed p-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="text-sm text-neutral-700">
            Drag & drop a .csv file here, or
          </div>
          <div className="mt-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border px-3 py-1.5 text-sm"
            >
              Choose file
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFileSelect(f)
            }}
          />
          {fileName && (
            <div className="mt-3 text-xs text-neutral-600">
              Selected: <span className="font-mono">{fileName}</span>
            </div>
          )}
        </div>

        {/* Helper: template link + requirements */}
        <div className="mt-3 rounded-xl border p-4 text-xs text-neutral-700">
          <div>
            Need a sample?{' '}
            <a
              href="/templates/writeoffs_csv_template.csv"
              download
              className="font-semibold underline"
              style={{ color: '#243186' }}
            >
              Download the CSV template
            </a>
            .
          </div>
          <div className="mt-2">
            Required columns: <code>date</code>, <code>description</code>, <code>amount</code>. Dates can be{' '}
            <code>YYYY-MM-DD</code>, <code>MM/DD/YYYY</code>, or <code>DD/MM/YYYY</code>. Amounts: negative for debits, positive for credits
            (we’ll also interpret debit/credit headers server-side).
          </div>
          <div className="mt-1">Max file size: 5MB.</div>
        </div>

        {/* Mapping */}
        {status === 'ready' && (
          <div className="mt-8 rounded-2xl border p-5">
            <div className="text-sm font-semibold">Map your columns</div>
            <p className="mt-1 text-xs text-neutral-600">
              We guessed based on headers—adjust if needed.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FieldMap
                label="Date"
                value={mapping.date}
                options={headers}
                onChange={(v) => setMapping(m => ({ ...m, date: v }))}
              />
              <FieldMap
                label="Description / Vendor"
                value={mapping.description}
                options={headers}
                onChange={(v) => setMapping(m => ({ ...m, description: v }))}
              />
              <FieldMap
                label="Amount"
                value={mapping.amount}
                options={headers}
                onChange={(v) => setMapping(m => ({ ...m, amount: v }))}
              />
            </div>

            {/* Preview table */}
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    {headers.map(h => (
                      <th key={h} className="border-b px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, idx) => (
                    <tr key={idx} className="odd:bg-neutral-50">
                      {headers.map(h => (
                        <td key={h} className="px-3 py-1.5 align-top">{r[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={onSubmit}
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
              >
                Import {rows.length} row{rows.length === 1 ? '' : 's'}
              </button>
              <span className="text-xs text-neutral-600">
                We’ll import now and take you to Review next.
              </span>
            </div>
          </div>
        )}

        {/* Messages */}
        {message && (
          <div className={`mt-6 rounded-xl border p-4 text-sm ${status === 'error' ? 'border-red-300 text-red-700' : 'border-green-300 text-green-700'}`}>
            {message}
          </div>
        )}
      </section>
    </main>
  )
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function FieldMap({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string | null
  options: string[]
  onChange: (v: string | null) => void
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-neutral-700">{label}</span>
      <select
        className="rounded-xl border px-3 py-2"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— Select column —</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}
