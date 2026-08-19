-- Stable lookup keys required by the explicitly approved 2025 Tier A catalog.
-- This activates no treatment by itself and does not classify existing activity.

insert into public.categories (key, label) values
  ('advertising', 'Advertising'),
  ('office-expense', 'Office expenses'),
  ('supplies', 'Consumable supplies'),
  ('postage-shipping', 'Postage & shipping'),
  ('software-cloud', 'Software & cloud services'),
  ('payment-bank-fees', 'Payment-processing & bank service fees'),
  ('business-license', 'Business licenses')
on conflict (key) do nothing;
