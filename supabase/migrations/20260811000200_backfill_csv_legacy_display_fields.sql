-- Keep legacy Review, Dashboard, and reporting reads compatible with CSV rows.

update public.transactions
set
  date = coalesce(date, posted_at),
  vendor = coalesce(
    vendor,
    nullif(raw_description, ''),
    nullif(normalized_description, ''),
    'Imported transaction'
  ),
  description = coalesce(
    description,
    nullif(raw_description, ''),
    nullif(normalized_description, '')
  ),
  amount = coalesce(amount, amount_cents::numeric / 100)
where source = 'csv'
  and (
    date is null
    or vendor is null
    or description is null
    or amount is null
  );
