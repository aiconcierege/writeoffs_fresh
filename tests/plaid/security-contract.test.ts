import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Plaid route security contracts', () => {
  it.each(['link-token', 'exchange', 'sync', 'disconnect'])('%s derives ownership from authentication', (route) => {
    const code = source(`app/api/plaid/${route}/route.ts`)
    expect(code).toContain('getAuthenticatedContext')
    expect(code).toContain('unauthorizedResponse')
    expect(code).not.toMatch(/businessId\s*:\s*body|access[_-]?token/i)
  })

  it('verifies signed webhooks before recording a signal', () => {
    const code = source('app/api/plaid/webhook/route.ts')
    expect(code.indexOf('const verified = await verifyPlaidWebhook')).toBeLessThan(code.indexOf('const signal = await recordPlaidWebhook'))
    expect(code).toContain("request.headers.get('plaid-verification')")
  })

  it('never sends credentials, cursor, or provider identifiers through customer status RPCs', () => {
    const migration = source('supabase/migrations/20260819001000_add_plaid_transactions_ingestion.sql')
    const projection = migration.slice(migration.indexOf('function public.list_plaid_connections()'), migration.indexOf('function public.list_plaid_connection_accounts()'))
    expect(projection).not.toMatch(/access_token|sync_cursor|plaid_item_id/)
  })
})
