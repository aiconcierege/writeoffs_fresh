import fs from 'node:fs';import path from 'node:path';import {describe,expect,it} from 'vitest'
const sql=fs.readFileSync(path.join(process.cwd(),'supabase/migrations/20260825000300_add_statement_ocr_account_links.sql'),'utf8').toLowerCase()
describe('statement R2 schema',()=>{
  it('persists bounded page OCR once without exposing it to customers',()=>{expect(sql).toContain('create table public.statement_page_extractions')
    expect(sql).toContain('unique(business_id,document_id,page_number,extraction_version)');expect(sql).toContain('length(normalized_text)<=50000')
    expect(sql).toContain('grant select,insert on public.statement_page_extractions to service_role')})
  it('stores customer-confirmed account links and append-only correction history',()=>{expect(sql).toContain('financial_account_equivalence_links')
    expect(sql).toContain("provenance text not null default 'user'");expect(sql).toContain('unlink_statement_account')
    expect(sql).toContain('statement account and convergence history is append-only')})
  it('converges only exact unique observations under a confirmed account link',()=>{expect(sql).toContain('reconcile_confirmed_statement_account')
    expect(sql).toContain('target_rows.amount_cents=statement_rows.amount_cents');expect(sql).toContain('target_rows.transaction_date=statement_rows.transaction_date')
    expect(sql).toContain('select count(*) from statement_rows');expect(sql).toContain('current_bookkeeping_source_convergences')})
})
