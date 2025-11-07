/* File: app/api/receipts/ocr/route.ts
 * Version: v3
 * Date: 2025-10-15
 * Notes:
 *  - Runs Google Vision OCR, updates hints on the receipt,
 *  - Auto-posts a transaction, and LINKS the receipt to that transaction
 *    (receipts.transaction_id = txId) so it’s removed from the Receipts list.
 *  - needs_review = true if ANY of date/total/vendor missing/suspect.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

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

  // Fetch receipt & vertical
  const [{ data: rec, error: recErr }, { data: profile }] = await Promise.all([
    supabase.from('receipts')
      .select('id, storage_path, vendor_hint, date_hint, total_hint, transaction_id')
      .eq('id', receiptId)
      .maybeSingle(),
    supabase.from('profiles').select('vertical').eq('id', user.id).maybeSingle()
  ])
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 400 })
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // If already linked, do nothing (idempotent)
  if (rec.transaction_id) {
    return NextResponse.json({ ok: true, transaction_id: rec.transaction_id, parsed: null })
  }

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
    await supabase.from('receipts').update({ ocr_provider: 'vision', ocr_status: 'error', ocr_json: visionJson ?? {} }).eq('id', rec.id)
    return NextResponse.json({ ok: false, error: e?.message || 'OCR failed' }, { status: 200 })
  }

  // Parse
  const parsed = parseFields(text)

  // Update receipt hints (don’t overwrite existing)
  await supabase.from('receipts').update({
    ocr_provider: 'vision',
    ocr_status: 'done',
    ocr_json: visionJson,
    vendor_hint: rec.vendor_hint ?? parsed.vendor ?? null,
    date_hint: rec.date_hint ?? parsed.date ?? null,
    total_hint: rec.total_hint ?? (typeof parsed.total === 'number' ? parsed.total : null)
  }).eq('id', rec.id)

  // Confidence/guardrail
  const hasDate = Boolean(rec.date_hint ?? parsed.date)
  const hasTotal = typeof (rec.total_hint ?? parsed.total) === 'number'
  const vendorStr = (rec.vendor_hint ?? parsed.vendor ?? '').trim()
  const vendorSuspect = vendorStr.length < 3 || GENERIC_VENDOR.test(vendorStr)
  const totalVal = Number(rec.total_hint ?? parsed.total ?? 0)
  const totalSuspect = !hasTotal || totalVal < 0.5 || totalVal > 10000
  const dateStr = (rec.date_hint ?? parsed.date ?? '') as string
  const dateSuspect = !hasDate || isDateOutOfRange(dateStr)
  const needsReview = (!hasDate) || (!hasTotal) || vendorSuspect || totalSuspect || dateSuspect

  const pack = profile?.vertical === 'realtor' ? 'realtor' : 'general'
  const category_key = await suggestCategoryKey(supabase, pack, vendorStr)

  // Idempotent: if a tx already exists (same receipt_id), reuse it; else create
  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('created_from_receipt_id', rec.id)
    .eq('user_id', user.id)
    .maybeSingle()

  let txId = existingTx?.id
  if (!txId) {
    const dateForInsert = hasDate ? dateStr : new Date().toISOString().slice(0,10)
    const vendorForInsert = vendorStr || 'Unknown'
    const amountForInsert = hasTotal ? (isNaN(totalVal) ? 0 : totalVal) : 0

    const { data: inserted, error: insErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        date: dateForInsert,
        vendor: vendorForInsert,
        description: vendorForInsert,
        amount: amountForInsert,
        category_key: category_key ?? null,
        source: 'receipt',
        status: 'posted',
        pack,
        needs_review: needsReview,
        created_from_receipt_id: rec.id,
        meta: { from: 'ocr', vendor_parsed: parsed.vendor ?? null, total_parsed: parsed.total ?? null, date_parsed: parsed.date ?? null }
      })
      .select('id')
      .single()
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message, parsed }, { status: 200 })
    txId = inserted!.id
  } else {
    await supabase.from('transactions').update({ needs_review: needsReview }).eq('id', txId)
  }

  // 🔗 Link the receipt to this transaction so it disappears from the Receipts list
  await supabase.from('receipts').update({ transaction_id: txId }).eq('id', rec.id)

  return NextResponse.json({ ok: true, parsed, transaction_id: txId, needs_review: needsReview })
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
function isDateOutOfRange(yyyy_mm_dd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyy_mm_dd)) return true
  const d = new Date(yyyy_mm_dd + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return true
  const now = new Date()
  const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(now.getFullYear() - 2)
  return d > now || d < twoYearsAgo
}
async function suggestCategoryKey(supabase: any, pack: 'general' | 'realtor', vendor: string | null) {
  const v = (vendor || '').trim()
  if (!v) return null
  const { data: rs } = await supabase.from('rulesets').select('rules').eq('vertical', pack).order('id', { ascending: false }).limit(1).maybeSingle()
  const rules: Array<{ match?: { vendor_ilike?: string }, set?: { category_key?: string } }> = rs?.rules || []
  for (const r of rules) {
    const pat = r.match?.vendor_ilike, to = r.set?.category_key
    if (!pat || !to) continue
    const re = new RegExp(pat.replace(/%/g, '.*'), 'i')
    if (re.test(v)) return to
  }
  return null
}
