import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const sql=readFileSync('supabase/migrations/20260901000400_add_receipt_meal_candidates.sql','utf8')
describe('receipt meal candidate boundary',()=>{
 it('retains evidence without manufacturing business or tax treatment',()=>{expect(sql).toContain('create table public.bookkeeping_receipt_meal_candidates');expect(sql).toContain("support_kind in('explicit_restaurant_context','meal_line_items')");expect(sql).not.toMatch(/tax_category_key[^\n]*meals|treatment[^\n]*business|allocation_kind[^\n]*business/)})
 it('projects the existing canonical factual questions in order',()=>{expect(sql).toContain("active_reason:='BUSINESS_USE_UNCLEAR'");expect(sql).toContain("active_reason:='BUSINESS_PURPOSE_NEEDED'");expect(sql).toContain("'meal_attendee_relationship'");expect(sql).toContain('current_bookkeeping_record_convergences')})
 it('uses narrow tenant-safe worker and customer RPCs',()=>{expect(sql).toContain("auth.role())<>'service_role'");expect(sql).toContain('enable row level security');expect(sql).toContain('receipt_meal_candidates_select_own');expect(sql).toContain('from public,anon,authenticated');expect(sql).toContain('from public,anon,service_role')})
})
