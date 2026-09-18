-- Keep tenant-scoped orchestration reads bounded by the customer's own history.
create index betti_guided_assertions_business_created on public.betti_guided_assertions(business_id,created_at,id);
