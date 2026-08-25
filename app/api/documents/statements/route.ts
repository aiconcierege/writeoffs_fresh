import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/

export async function GET() {
  const supabase=await createServerSupabase();const{data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const{data,error}=await supabase.from('current_customer_statement_status')
    .select('id,original_name,bytes,created_at,processing_status,attempt_count').order('created_at',{ascending:false}).limit(200)
  if(error)return NextResponse.json({error:'Statements could not be loaded.'},{status:503})
  return NextResponse.json({ok:true,documents:data??[]})
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  if (typeof body.id !== 'string' || !UUID.test(body.id) || typeof body.uploadFingerprint !== 'string'
    || !HASH.test(body.uploadFingerprint) || typeof body.storagePath !== 'string'
    || typeof body.originalName !== 'string' || body.originalName.length > 255
    || body.mimeType !== 'application/pdf' || !Number.isSafeInteger(body.bytes)
    || Number(body.bytes) < 1 || Number(body.bytes) > 100 * 1024 * 1024
    || !['bank_statement','card_statement'].includes(String(body.documentClass))) {
    return NextResponse.json({ error: 'invalid statement metadata' }, { status: 400 })
  }
  const { data, error } = await supabase.rpc('register_business_statement', {
    p_document_id: body.id,p_document_class: body.documentClass,p_upload_fingerprint: body.uploadFingerprint,
    p_storage_path: body.storagePath,p_original_name: body.originalName,p_mime_type: body.mimeType,p_bytes: body.bytes,
  })
  if (error) return NextResponse.json({ error: 'The statement could not be registered.' }, { status: 400 })
  return NextResponse.json({ ok: true,document: data })
}
