-- Add nullable Product Specification v2 onboarding intake preferences.
--
-- These answers describe onboarding intent only. They do not create vehicle or
-- financial-account records, and existing Businesses are intentionally not backfilled.

alter table public.businesses
  add column uses_vehicle_for_business boolean,
  add column expected_financial_account_count smallint,
  add column expected_financial_account_use text,
  add column onboarding_start_method text,
  add constraint businesses_expected_financial_account_count_check check (
    expected_financial_account_count is null
    or expected_financial_account_count between 0 and 6
  ),
  add constraint businesses_expected_financial_account_use_check check (
    expected_financial_account_use is null
    or expected_financial_account_use in (
      'primarily_business',
      'mixed_use'
    )
  ),
  add constraint businesses_onboarding_start_method_check check (
    onboarding_start_method is null
    or onboarding_start_method in (
      'receipts',
      'connected_financial_accounts',
      'statement_uploads'
    )
  );

comment on column public.businesses.uses_vehicle_for_business is
  'Nullable v2 onboarding answer indicating whether the user uses a vehicle for business.';
comment on column public.businesses.expected_financial_account_count is
  'Nullable v2 onboarding estimate of how many financial accounts the user expects to connect.';
comment on column public.businesses.expected_financial_account_use is
  'Nullable v2 onboarding answer describing the overall expected account setup; it does not classify actual Financial Account records.';
comment on column public.businesses.onboarding_start_method is
  'Nullable v2 onboarding preference for starting with receipts, connected accounts, or statement uploads.';
