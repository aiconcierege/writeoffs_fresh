import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(),
  'supabase/migrations/20260824000400_add_canonical_invoice_workflow.sql'), 'utf8')

describe('canonical invoice schema', () => {
  it('keeps invoices separate from cash-basis economic records', () => {
    expect(sql).toContain('create table public.canonical_invoices')
    expect(sql).toContain('create table public.invoice_income_links')
    expect(sql).not.toMatch(/insert into public\.bookkeeping_records[\s\S]*create_canonical_invoice/)
    expect(sql).toContain("decision.bookkeeping_nature='business_income'")
  })

  it('uses exact cents, current leaves, append-only history, and idempotency', () => {
    expect(sql).toContain('original_amount_cents bigint not null')
    expect(sql).toContain('canonical_invoice_events_successor_idx')
    expect(sql).toContain('invoice history is append-only')
    expect(sql).toContain('invoice request identity was reused with different facts')
    expect(sql).toContain('invoice_income_links_record_unique')
  })

  it('enforces Business-scoped ownership and safe paid-state transitions', () => {
    expect(sql).toContain('canonical_invoices_customer_fkey')
    expect(sql).toContain('invoice_income_links_record_fkey')
    expect(sql).toContain("invoice.status<>'awaiting_payment'")
    expect(sql).toContain('paid or canceled invoice cannot be corrected')
    expect(sql).toContain('paid, canceled, or changed invoice cannot be canceled')
  })
})
