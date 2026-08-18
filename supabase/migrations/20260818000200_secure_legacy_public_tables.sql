-- Close legacy public-schema Data API exposure without changing existing data.
--
-- The public waitlist remains write-only for the existing landing-page form.
-- Categories and rulesets remain readable by authenticated application users.
-- Subscriptions and unowned mileage data remain service-role-only.

alter table public.waitlist enable row level security;
alter table public.mileage_trips enable row level security;
alter table public.categories enable row level security;
alter table public.rulesets enable row level security;
alter table public.subscriptions enable row level security;

revoke all privileges on table public.waitlist from anon, authenticated;
revoke all privileges on table public.mileage_trips from anon, authenticated;
revoke all privileges on table public.categories from anon, authenticated;
revoke all privileges on table public.rulesets from anon, authenticated;
revoke all privileges on table public.subscriptions from anon, authenticated;

-- Preserve the existing server-side administration and compatibility paths.
grant all privileges on table public.waitlist to service_role;
grant all privileges on table public.mileage_trips to service_role;
grant all privileges on table public.categories to service_role;
grant all privileges on table public.rulesets to service_role;
grant all privileges on table public.subscriptions to service_role;

-- The public form inserts exactly these factual fields and does not read rows
-- back. Column-scoped grants prevent callers from supplying audit metadata.
grant insert (email, name, source) on table public.waitlist to anon, authenticated;

drop policy if exists "waitlist_public_insert" on public.waitlist;
create policy "waitlist_public_insert"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- Legacy authenticated screens still read these shared reference tables.
grant select on table public.categories to authenticated;
grant select on table public.rulesets to authenticated;

drop policy if exists "categories_read_authenticated" on public.categories;
create policy "categories_read_authenticated"
  on public.categories
  for select
  to authenticated
  using (true);

drop policy if exists "rulesets_read_authenticated" on public.rulesets;
create policy "rulesets_read_authenticated"
  on public.rulesets
  for select
  to authenticated
  using (true);

-- No customer policies are intentionally created for subscriptions or
-- mileage_trips. Mileage has no ownership column and must not be guessed.
