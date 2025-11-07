/* File: app/api/export/csv/route.ts
 * Version: v2
 * Date: 2025-10-14
 * Notes: Awaits async createServerSupabase() to satisfy Next 15 cookies() semantics.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../utils/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const packParam = url.searchParams.get('pack')
  const needsParam = url.searchParams.get('needs')
  const needsOnly = needsParam === '1'
  const packFilter =
    packParam === 'general' || packParam === 'realtor' ? packParam : null

  const supabase = await createServerSupabase()

  // Auth required
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Build query
  let query = supabase
    .from('transactions')
    .select('date,vendor,description,amount,category_key,pack')
    .order('date', { ascending: true })
    .limit(50000)

  if (packFilter) query = query.eq('pack', packFilter)
  if (needsOnly) query = query.is('category_key', null)

  const { data: rows = [], error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Compose CSV
  const header = ['date', 'vendor', 'description', 'amount', 'category_key', 'pack']
  const csvLines = [header.join(',')]

  for (const r of rows as any[]) {
    const cells = [
      safe(r.date),
      safe(r.vendor),
      safe(r.description ?? ''),
      String(r.amount ?? ''),
      safe(r.category_key ?? ''),
      safe(r.pack ?? '')
    ]
    csvLines.push(cells.join(','))
  }

  const csv = csvLines.join('\n')
  const filename = `writeoffs_export${packFilter ? `_${packFilter}` : ''}${needsOnly ? '_needs' : ''}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
}

function safe(v: string) {
  if (/[\",\n]/.test(v)) {
    return `"${String(v).replace(/\"/g, '\"\"')}"`
  }
  return String(v)
}
