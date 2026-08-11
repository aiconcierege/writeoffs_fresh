import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260811000100_fix_receipt_storage_and_csv_dedupe.sql'
  ),
  'utf8'
)

const csvImporter = readFileSync(
  join(process.cwd(), 'app/api/import/csv/route.ts'),
  'utf8'
)

const csvDisplayBackfill = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260811000200_backfill_csv_legacy_display_fields.sql'
  ),
  'utf8'
)

describe('legacy receipt storage compatibility', () => {
  it('creates a private receipts bucket', () => {
    expect(migration).toContain("values ('receipts', 'receipts', false)")
    expect(migration).toContain('set public = false')
  })

  it.each(['select', 'insert', 'update', 'delete'])(
    'restricts receipt object %s operations to authenticated ownership',
    (operation) => {
      expect(migration).toContain(`on storage.objects for ${operation}`)
      expect(migration).toContain("bucket_id = 'receipts'")
      expect(migration).toContain("split_part(name, '/', 1) = 'receipts'")
      expect(migration).toContain("split_part(name, '/', 2) = (select auth.uid())::text")
    }
  )
})

describe('legacy CSV tenant deduplication', () => {
  it('defines a composite tenant and fingerprint uniqueness boundary', () => {
    expect(migration).toContain(
      'create unique index transactions_user_dedupe_hash_unique_idx'
    )
    expect(migration).toContain(
      'on public.transactions (user_id, dedupe_hash)'
    )
    expect(migration).not.toContain('on public.transactions (dedupe_hash)')
  })

  it('uses the composite conflict target in the importer', () => {
    expect(csvImporter).toContain(
      '.upsert(prepared, { onConflict: "user_id,dedupe_hash" })'
    )
    expect(csvImporter).not.toContain(
      '.upsert(prepared, { onConflict: "dedupe_hash" })'
    )
  })
})

describe('legacy CSV display compatibility', () => {
  it('dual-writes the fields consumed by existing Review and Dashboard screens', () => {
    expect(csvImporter).toContain('date: posted_at')
    expect(csvImporter).toContain(
      'vendor: rawDesc || normalized_description || "Imported transaction"'
    )
    expect(csvImporter).toContain(
      'description: rawDesc || normalized_description || null'
    )
    expect(csvImporter).toMatch(/\n\s+amount,\n/)

    expect(csvImporter).toContain('posted_at,')
    expect(csvImporter).toContain('amount_cents,')
    expect(csvImporter).toContain('raw_description: rawDesc')
    expect(csvImporter).toContain('normalized_description,')
  })

  it('backfills only missing legacy fields on CSV-imported rows', () => {
    expect(csvDisplayBackfill).toContain("where source = 'csv'")
    expect(csvDisplayBackfill).toContain('date = coalesce(date, posted_at)')
    expect(csvDisplayBackfill).toContain('vendor = coalesce(')
    expect(csvDisplayBackfill).toContain('description = coalesce(')
    expect(csvDisplayBackfill).toContain(
      'amount = coalesce(amount, amount_cents::numeric / 100)'
    )
    expect(csvDisplayBackfill).toMatch(/date is null[\s\S]+amount is null/)
  })
})
