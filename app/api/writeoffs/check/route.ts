import { NextResponse } from 'next/server'

/**
 * Legacy merchant/category tax lookup. Canonical Tax Rules v1 intentionally has
 * no active production rules, so this endpoint must not produce a tax conclusion.
 */
export async function POST() {
  return NextResponse.json({ error: 'tax_rules_unavailable' }, { status: 503 })
}
