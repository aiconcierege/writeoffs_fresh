import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../utils/supabase/server'
import { listCanonicalReceipts, registerReceipt } from '../../lib/bookkeeping/receipt-workflow'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/

export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    const receipts = await listCanonicalReceipts({ supabase: await createServerSupabase(), limit })
    return NextResponse.json({ ok: true, receipts })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to load receipts.'
    return NextResponse.json({ error: message }, { status: /authenticated/.test(message) ? 401 : 400 })
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const keys = Object.keys(body).sort()
  const expected = ['bytes', 'id', 'mimeType', 'originalName', 'storagePath', 'uploadFingerprint'].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) ||
      typeof body.id !== 'string' || !UUID.test(body.id) ||
      typeof body.uploadFingerprint !== 'string' || !HASH.test(body.uploadFingerprint) ||
      typeof body.storagePath !== 'string' || typeof body.originalName !== 'string' ||
      typeof body.mimeType !== 'string' || !['image/jpeg','image/png','image/webp','application/pdf'].includes(body.mimeType) ||
      !Number.isSafeInteger(body.bytes) || (body.bytes as number) < 1 || (body.bytes as number) > 20 * 1024 * 1024 ||
      body.originalName.length > 255) {
    return NextResponse.json({ error: 'invalid receipt metadata' }, { status: 400 })
  }
  try {
    const receipt = await registerReceipt({ supabase, id: body.id,
      uploadFingerprint: body.uploadFingerprint, storagePath: body.storagePath,
      originalName: body.originalName, mimeType: body.mimeType, bytes: body.bytes as number })
    return NextResponse.json({ ok: true, receipt })
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Unable to save receipt.' }, { status: 400 })
  }
}
