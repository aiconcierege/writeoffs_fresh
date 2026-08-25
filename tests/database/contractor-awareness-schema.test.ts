import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const sql=readFileSync('supabase/migrations/20260824000600_add_contractor_awareness.sql','utf8')
const rules2026=readFileSync('supabase/migrations/20260825000500_correct_2026_contractor_awareness.sql','utf8')
describe('contractor awareness schema',()=>{it('keeps bounded append-only Business-owned identities and relationships',()=>{for(const table of['canonical_contractors','canonical_contractor_events','contractor_payment_events','contractor_w9_events'])expect(sql).toContain(`create table public.${table}`);expect(sql).toContain('contractor_payment_record_fkey');expect(sql).toContain('contractor_payments_no_mutation');expect(sql).not.toMatch(/ssn|ein|taxpayer_identification/i)});it('preserves bounded factual payment methods and W-9 states',()=>{for(const value of['cash','check','ach_zelle','payment_card','third_party_service','other','unknown'])expect(sql).toContain(`'${value}'`);for(const value of['needed','on_file','needs_attention'])expect(sql).toContain(`'${value}'`)});it('uses tenant-scoped authenticated RPCs and RLS',()=>{expect(sql).toContain('contractor_owner_business');expect(sql).toContain('contractor_payments_select_own');expect(sql).toContain('contractor_w9_select_own')})})
describe('2026 contractor awareness rule',()=>{it('appends the official $2,000 successor and resolves the current leaf',()=>{
 expect(rules2026).toContain("'contractor-awareness:2026:v2', 200000")
 expect(rules2026).toContain('supersedes_rule_id')
 expect(rules2026).toContain('current_contractor_awareness_rules')
 expect(rules2026).not.toMatch(/update public\.contractor_awareness_rule_versions|delete from public\.contractor_awareness_rule_versions/i)
})})
