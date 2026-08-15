/* File: app/api/receipts/annotate/route.ts
 * Version: v2
 * Date: 2025-10-14
 * Notes:
 *  - POST { id: string }
 *  - Parses the receipt's original filename (public.receipts.original_name) to extract vendor/date/total hints.
 *  - Falls back to storage_path basename if original_name is missing.
 *  - Updates public.receipts: vendor_hint, date_hint, total_hint
 *  - Examples that will parse:
 *      2025-02-03_Starbucks_6.48.jpg
 *      Starbucks-2025-02-03-$6.48.png
 *      02-03-2025 Starbucks $6.48.jpeg
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // Auth required
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Parse body
  let id: unknown
  try {
    const body = await req.json()
    id = body?.id
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Fetch receipt row, including original_name
  const { data: rec, error: fetchErr } = await supabase
    .from('receipts')
    .select('id, storage_path, original_name')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 })
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const sourceName: string = rec.original_name
    ? rec.original_name
    : basename(rec.storage_path)

  // Attempt to parse date and amount
  const date = parseDateFromString(sourceName) // 'YYYY-MM-DD' or null
  const total = parseAmountFromString(sourceName) // number or null
  const vendor = parseVendorFromString(sourceName) // string or null

  // Build update payload (only set if found)
  const payload: {
    vendor_hint?: string
    date_hint?: string
    total_hint?: number
  } = {}
  if (vendor) payload.vendor_hint = vendor
  if (date) payload.date_hint = date
  if (typeof total === 'number') payload.total_hint = total

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({
      ok: true,
      parsed: { vendor_hint: null, date_hint: null, total_hint: null },
      note: 'No hints parsed from filename.'
    })
  }

  const { error: updErr } = await supabase
    .from('receipts')
    .update(payload)
    .eq('id', rec.id)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

  return NextResponse.json({
    ok: true,
    parsed: {
      vendor_hint: vendor ?? null,
      date_hint: date ?? null,
      total_hint: typeof total === 'number' ? total : null
    }
  })
}

/* ---------- helpers ---------- */

function basename(p: string) {
  const parts = p.split('/')
  return parts[parts.length - 1] || p
}

function parseDateFromString(s: string): string | null {
  // Try YYYY-MM-DD
  const iso = s.match(/(\d{4})[-_](\d{2})[-_](\d{2})/)
  if (iso) {
    const y = iso[1], m = iso[2], d = iso[3]
    if (isValidYMD(y, m, d)) return `${y}-${m}-${d}`
  }
  // Try MM-DD-YYYY or MM_DD_YYYY
  const mdy = s.match(/(\d{1,2})[-_](\d{1,2})[-_](\d{4})/)
  if (mdy) {
    const m = pad2(mdy[1]), d = pad2(mdy[2]), y = mdy[3]
    if (isValidYMD(y, m, d)) return `${y}-${m}-${d}`
  }
  return null
}

function parseAmountFromString(s: string): number | null {
  // $12.34 or 12.34 — prefer the last number in the name (often the total)
  const matches = s.match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/g)
  if (!matches || matches.length === 0) return null
  const last = matches[matches.length - 1].replace(/\$/g, '').trim()
  const n = Number(last)
  return Number.isNaN(n) ? null : n
}

function parseVendorFromString(s: string): string | null {
  // Remove extension
  const name = s.replace(/\.[a-zA-Z0-9]+$/, '')
  // Split on common separators and filter out obvious tokens (date, numbers)
  const parts = name.split(/[\s._-]+/).filter(Boolean)

  // Remove tokens that are clearly date or amount
  const filtered = parts.filter(tok => {
    const isIsoDate = /^\d{4}[-_]\d{2}[-_]\d{2}$/.test(tok)
    const isMdyDate = /^\d{1,2}[-_]\d{1,2}[-_]\d{4}$/.test(tok)
    const isMoney = /^\$?\d+(\.\d{1,2})?$/.test(tok)
    return !(isIsoDate || isMdyDate || isMoney)
  })

  if (filtered.length === 0) return null

  // Heuristic: keep alphas/digits and title-case; join first 2–3 tokens
  const cleaned = filtered
    .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')

  return cleaned ? titleCase(cleaned) : null
}

function isValidYMD(y: string, m: string, d: string) {
  const yy = Number(y), mm = Number(m), dd = Number(d)
  if (yy < 2000 || yy > 2100) return false
  if (mm < 1 || mm > 12) return false
  if (dd < 1 || dd > 31) return false
  return true
}

function pad2(n: string) {
  return String(Number(n)).padStart(2, '0')
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}
