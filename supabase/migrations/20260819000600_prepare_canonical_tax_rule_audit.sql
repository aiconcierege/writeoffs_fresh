-- Audit metadata for future approved tax-rule conclusions. This migration adds
-- no rule catalog and activates no tax treatment.

alter table public.bookkeeping_tax_treatments
  drop constraint bookkeeping_tax_treatments_status_check,
  drop constraint bookkeeping_tax_treatments_shape_check,
  add column tax_year integer,
  add column outcome_type text,
  add column adjustment_method text,
  add column factual_basis jsonb not null default '{}'::jsonb,
  add column authority_references jsonb not null default '[]'::jsonb,
  add constraint bookkeeping_tax_treatments_tax_year_check
    check (tax_year is null or tax_year between 2000 and 2200),
  add constraint bookkeeping_tax_treatments_outcome_type_check
    check (outcome_type is null or outcome_type in
      ('full_deduction','fixed_fraction','nondeductible','special_treatment')),
  add constraint bookkeeping_tax_treatments_adjustment_method_check
    check (adjustment_method is null or adjustment_method in ('none','fixed_fraction','special_calculation')),
  add constraint bookkeeping_tax_treatments_factual_basis_check
    check (jsonb_typeof(factual_basis) = 'object'),
  add constraint bookkeeping_tax_treatments_authority_references_check
    check (jsonb_typeof(authority_references) = 'array'),
  add constraint bookkeeping_tax_treatments_status_check
    check (treatment_status in
      ('unresolved','requires_facts','deductible','not_deductible','special_treatment')),
  add constraint bookkeeping_tax_treatments_shape_check check (
    (treatment_status = 'unresolved' and deductible_amount_cents is null
      and tax_category_key is null and rule_key is null and rule_version is null)
    or
    (treatment_status in ('requires_facts','special_treatment')
      and deductible_amount_cents is null and tax_category_key is not null
      and length(btrim(rule_key)) > 0 and rule_version > 0)
    or
    (treatment_status = 'not_deductible' and deductible_amount_cents = 0
      and tax_category_key is not null and length(btrim(rule_key)) > 0 and rule_version > 0)
    or
    (treatment_status = 'deductible' and deductible_amount_cents <> 0
      and tax_category_key is not null and length(btrim(rule_key)) > 0 and rule_version > 0)
  );

comment on column public.bookkeeping_tax_treatments.tax_year is
  'Tax year evaluated by the exact versioned rule; null only for conclusions created before the rule-catalog framework.';
comment on column public.bookkeeping_tax_treatments.factual_basis is
  'Snapshot of canonical factual inputs supporting the tax conclusion; never a replacement for source or bookkeeping facts.';
comment on column public.bookkeeping_tax_treatments.authority_references is
  'Compact identifiers and revision metadata, not copied source text.';
