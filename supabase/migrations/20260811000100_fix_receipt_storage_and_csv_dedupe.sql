-- Restore legacy receipt uploads and make CSV deduplication tenant-scoped.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update
set public = false;

drop policy if exists "receipt_objects_select_own" on storage.objects;
create policy "receipt_objects_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and split_part(name, '/', 1) = 'receipts'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

drop policy if exists "receipt_objects_insert_own" on storage.objects;
create policy "receipt_objects_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and split_part(name, '/', 1) = 'receipts'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

drop policy if exists "receipt_objects_update_own" on storage.objects;
create policy "receipt_objects_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'receipts'
    and split_part(name, '/', 1) = 'receipts'
    and split_part(name, '/', 2) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'receipts'
    and split_part(name, '/', 1) = 'receipts'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

drop policy if exists "receipt_objects_delete_own" on storage.objects;
create policy "receipt_objects_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and split_part(name, '/', 1) = 'receipts'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

create unique index transactions_user_dedupe_hash_unique_idx
  on public.transactions (user_id, dedupe_hash);

comment on index public.transactions_user_dedupe_hash_unique_idx is
  'Allows identical imported transaction fingerprints for different tenants while deduplicating within one tenant.';
