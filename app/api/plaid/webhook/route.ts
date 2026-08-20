import { after, NextResponse } from 'next/server'
import { processPlaidWebhookSync, recordPlaidWebhook, verifyPlaidWebhook } from '../../../lib/plaid/webhooks'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const verification = request.headers.get('plaid-verification')
  const verified = await verifyPlaidWebhook({
    rawBody, verification,
  })
  if (!verified) return NextResponse.json({ error: 'invalid_webhook' }, { status: 401 })
  try {
    const signal = await recordPlaidWebhook(rawBody, verification!)
    if (signal.shouldSync && signal.itemId) after(() => processPlaidWebhookSync(signal.itemId!))
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: 'invalid_webhook' }, { status: 400 })
  }
}
