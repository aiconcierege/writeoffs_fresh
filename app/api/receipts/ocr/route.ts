import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'
import { recordReceiptExtraction } from '../../../lib/bookkeeping/receipt-workflow'

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

export async function POST(req: Request) {
  const supabase = await createServerSupabase()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Body
  let receiptId: string | undefined
  try {
    const body = await req.json()
    receiptId = body?.id
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!receiptId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: rec, error: recErr } = await supabase.from('receipts')
    .select('id, storage_path').eq('id', receiptId).maybeSingle()
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 400 })
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: prior } = await supabase.from('bookkeeping_receipt_extractions')
    .select('merchant,occurred_on,total_amount_cents').eq('receipt_id', receiptId)
    .eq('extraction_key', 'vision:v1').maybeSingle()
  if (prior) return NextResponse.json({ ok: true, parsed: {
    vendor: prior.merchant, date: prior.occurred_on,
    total: prior.total_amount_cents == null ? null : Number(prior.total_amount_cents) / 100,
  } })

  // Signed URL
  const { data: signed, error: signedErr } = await supabase
    .storage.from('receipts').createSignedUrl(rec.storage_path, 300)
  if (signedErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signedErr?.message || 'could not sign URL' }, { status: 400 })
  }

  const apiKey = process.env.GCV_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'missing GCV_API_KEY' }, { status: 500 })

  // Vision call
  const visionPayload = { requests: [{ image: { source: { imageUri: signed.signedUrl } }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }
  let visionJson: any = null
  let text = ''
  try {
    const res = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(visionPayload)
    })
    visionJson = await res.json()
    if (!res.ok) throw new Error(visionJson?.error?.message || 'Vision error')
    text = visionJson?.responses?.[0]?.fullTextAnnotation?.text
        || visionJson?.responses?.[0]?.textAnnotations?.[0]?.description || ''
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'OCR failed' }, { status: 200 })
  }

  // Parse
  const parsed = parseFields(text)

  const result = await recordReceiptExtraction({
    supabase, receiptId: rec.id, extractionKey: 'vision:v1', provider: 'google_vision',
    merchant: parsed.vendor, occurredOn: parsed.date,
    totalAmountCents: parsed.total == null ? null : Math.round(parsed.total * 100),
    rawPayload: { extractedText: text.slice(0, 20000) },
  })
  return NextResponse.json({ ok: true, parsed, result })
}

/* ---------------- helpers ---------------- */

function parseFields(text: string) {
  const clean = (text || '').replace(/\r/g, '')
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)
  const date = findDate(lines.join(' '))
  const total = findTotal(lines)
  const vendor = findVendor(lines)
  return { date, total, vendor }
}
function findDate(s: string): string | null {
  let m = s.match(/(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})/)
  if (m && validYMD(m[1], m[2], m[3])) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (m) { const mm = pad2(m[1]), dd = pad2(m[2]), yy = m[3]; if (validYMD(yy, mm, dd)) return `${yy}-${mm}-${dd}` }
  return null
}
function findTotal(lines: string[]): number | null {
  for (const ln of lines) if (/total/i.test(ln)) { const amt = matchMoney(ln); if (amt != null) return amt }
  let best: number | null = null
  for (const ln of lines) {
    const all = ln.match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/g); if (!all) continue
    for (const raw of all) { const n = Number(raw.replace(/\$/g, '').trim()); if (!Number.isNaN(n)) { if (best == null || n > best) best = n } }
  }
  return best
}
const GENERIC_VENDOR = /receipt|invoice|thank|order|purchase|subtotal|total|tax|balance|change/i
function findVendor(lines: string[]): string | null {
  for (const ln of lines) {
    if (!ln) continue
    if (GENERIC_VENDOR.test(ln)) continue
    if (matchMoney(ln) != null) continue
    if (findDate(ln)) continue
    const cleaned = ln.replace(/[^a-zA-Z0-9&' ]+/g, ' ').trim()
    if (cleaned.length >= 3) {
      return cleaned.toLowerCase().split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
    }
  }
  return null
}
function matchMoney(s: string): number | null { const m = s.match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/); if (!m) return null; const n = Number(m[1]); return Number.isNaN(n) ? null : n }
function validYMD(y: string, m: string, d: string) { const yy = Number(y), mm = Number(m), dd = Number(d); if (yy < 2000 || yy > 2100) return false; if (mm < 1 || mm > 12) return false; if (dd < 1 || dd > 31) return false; return true }
function pad2(n: string) { return String(Number(n)).padStart(2, '0') }
