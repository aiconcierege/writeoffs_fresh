-- Canonical receipt ingestion and unmatched-receipt lifecycle.
-- Existing receipt rows remain readable; new customer writes use narrow RPCs.

alter table public.receipts add column business_id uuid references public.businesses(id) on delete restrict;
alter table public.receipts add column upload_fingerprint text;

update public.receipts r set business_id = b.id
from public.businesses b where b.owner_user_id = r.user_id and r.business_id is null;

create unique index receipts_business_upload_fingerprint_idx
  on public.receipts (business_id, upload_fingerprint)
  where business_id is not null and upload_fingerprint is not null;
create unique index receipts_id_business_unique_idx on public.receipts (id, business_id);

create table public.bookkeeping_receipt_extractions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  receipt_id uuid not null,
  extraction_key text not null,
  provider text not null,
  merchant text,
  occurred_on date,
  total_amount_cents bigint,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  constraint bookkeeping_receipt_extractions_receipt_fkey
    foreign key (receipt_id, business_id) references public.receipts(id, business_id) on delete restrict,
  constraint bookkeeping_receipt_extractions_total_check
    check (total_amount_cents is null or total_amount_cents > 0),
  constraint bookkeeping_receipt_extractions_key_unique
    unique (business_id, receipt_id, extraction_key),
  constraint bookkeeping_receipt_extractions_id_scope_unique unique (id, business_id)
);

create table public.bookkeeping_receipt_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  receipt_id uuid not null,
  supersedes_event_id uuid,
  sequence_number integer not null,
  event_type text not null,
  bookkeeping_record_id uuid,
  bookkeeping_document_link_id uuid,
  extraction_id uuid,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bookkeeping_receipt_events_receipt_fkey
    foreign key (receipt_id, business_id) references public.receipts(id, business_id) on delete restrict,
  constraint bookkeeping_receipt_events_predecessor_fkey
    foreign key (supersedes_event_id, business_id, receipt_id)
    references public.bookkeeping_receipt_events(id, business_id, receipt_id) on delete restrict,
  constraint bookkeeping_receipt_events_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_receipt_events_link_fkey
    foreign key (bookkeeping_document_link_id, business_id, bookkeeping_record_id)
    references public.bookkeeping_document_links(id, business_id, bookkeeping_record_id) on delete restrict,
  constraint bookkeeping_receipt_events_extraction_fkey
    foreign key (extraction_id, business_id)
    references public.bookkeeping_receipt_extractions(id, business_id) on delete restrict,
  constraint bookkeeping_receipt_events_id_scope_unique unique (id, business_id, receipt_id),
  constraint bookkeeping_receipt_events_type_check check (
    event_type in ('uploaded', 'extraction_completed', 'matched', 'unmatched', 'kept', 'discarded')
  ),
  constraint bookkeeping_receipt_events_provenance_check check (
    provenance in ('automation', 'system', 'user')
  ),
  constraint bookkeeping_receipt_events_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  ),
  constraint bookkeeping_receipt_events_sequence_check check (
    (supersedes_event_id is null and sequence_number = 1)
    or (supersedes_event_id is not null and sequence_number > 1)
  ),
  constraint bookkeeping_receipt_events_shape_check check (
    (event_type = 'uploaded' and extraction_id is null and bookkeeping_record_id is null)
    or (event_type = 'extraction_completed' and extraction_id is not null and bookkeeping_record_id is null)
    or (event_type in ('matched','kept') and bookkeeping_record_id is not null and bookkeeping_document_link_id is not null)
    or (event_type in ('discarded','unmatched') and bookkeeping_record_id is null and bookkeeping_document_link_id is null)
  )
);

create unique index bookkeeping_receipt_events_one_root_idx
  on public.bookkeeping_receipt_events (receipt_id) where supersedes_event_id is null;
create unique index bookkeeping_receipt_events_one_successor_idx
  on public.bookkeeping_receipt_events (supersedes_event_id) where supersedes_event_id is not null;
create index bookkeeping_receipt_events_business_created_idx
  on public.bookkeeping_receipt_events (business_id, created_at desc);

create or replace function public.protect_bookkeeping_receipt_history()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'canonical receipt history is append-only'; end;
$$;
create trigger bookkeeping_receipt_extractions_append_only
  before update or delete on public.bookkeeping_receipt_extractions
  for each row execute function public.protect_bookkeeping_receipt_history();
create trigger bookkeeping_receipt_events_append_only
  before update or delete on public.bookkeeping_receipt_events
  for each row execute function public.protect_bookkeeping_receipt_history();

create or replace function public.validate_bookkeeping_receipt_event()
returns trigger language plpgsql set search_path = '' as $$
declare predecessor public.bookkeeping_receipt_events%rowtype;
begin
  if new.actor_user_id is not null and not exists (
    select 1 from public.businesses where id = new.business_id and owner_user_id = new.actor_user_id
  ) then raise exception 'receipt event actor does not own Business'; end if;
  if new.supersedes_event_id is not null then
    select * into predecessor from public.bookkeeping_receipt_events where id = new.supersedes_event_id;
    if not found or predecessor.business_id <> new.business_id or predecessor.receipt_id <> new.receipt_id
      or predecessor.sequence_number + 1 <> new.sequence_number
    then raise exception 'receipt event predecessor is invalid'; end if;
    if exists (select 1 from public.bookkeeping_receipt_events where supersedes_event_id = predecessor.id)
    then raise exception 'receipt history must supersede its current leaf'; end if;
    if predecessor.event_type in ('kept','discarded')
    then raise exception 'completed receipt action is immutable'; end if;
  end if;
  return new;
end;
$$;
create trigger bookkeeping_receipt_events_validate
  before insert on public.bookkeeping_receipt_events
  for each row execute function public.validate_bookkeeping_receipt_event();

alter table public.bookkeeping_receipt_extractions enable row level security;
alter table public.bookkeeping_receipt_events enable row level security;
create policy bookkeeping_receipt_extractions_select_own on public.bookkeeping_receipt_extractions
  for select to authenticated using (exists (
    select 1 from public.businesses where id = business_id and owner_user_id = (select auth.uid())
  ));
create policy bookkeeping_receipt_events_select_own on public.bookkeeping_receipt_events
  for select to authenticated using (exists (
    select 1 from public.businesses where id = business_id and owner_user_id = (select auth.uid())
  ));

revoke all on public.bookkeeping_receipt_extractions from public, anon, authenticated;
revoke all on public.bookkeeping_receipt_events from public, anon, authenticated;
grant select on public.bookkeeping_receipt_extractions to authenticated;
grant select on public.bookkeeping_receipt_events to authenticated;
grant all on public.bookkeeping_receipt_extractions to service_role;
grant all on public.bookkeeping_receipt_events to service_role;

create or replace function public.register_bookkeeping_receipt(
  p_receipt_id uuid, p_upload_fingerprint text, p_storage_path text,
  p_original_name text, p_mime_type text, p_bytes integer
) returns public.receipts language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; selected_receipt public.receipts%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_upload_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid upload fingerprint'; end if;
  if p_storage_path <> concat('receipts/', (select auth.uid())::text, '/', p_upload_fingerprint)
    then raise exception 'invalid receipt storage path'; end if;
  if p_bytes <= 0 or p_bytes > 20971520 then raise exception 'invalid receipt size'; end if;
  if p_mime_type <> 'application/pdf' and p_mime_type not like 'image/%'
    then raise exception 'unsupported receipt type'; end if;
  select id into selected_business_id from public.businesses where owner_user_id = (select auth.uid());
  if selected_business_id is null then raise exception 'Business unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat(selected_business_id, ':', p_upload_fingerprint), 53));
  insert into public.receipts(id,user_id,business_id,upload_fingerprint,storage_path,original_name,mime_type,bytes)
  values (p_receipt_id,(select auth.uid()),selected_business_id,p_upload_fingerprint,p_storage_path,
    left(nullif(btrim(p_original_name),''),255),p_mime_type,p_bytes)
  on conflict (business_id,upload_fingerprint) where business_id is not null and upload_fingerprint is not null do nothing
  returning * into selected_receipt;
  if selected_receipt.id is null then select * into selected_receipt from public.receipts
    where business_id=selected_business_id and upload_fingerprint=p_upload_fingerprint; end if;
  if selected_receipt.storage_path <> p_storage_path or selected_receipt.mime_type <> p_mime_type
    or selected_receipt.bytes <> p_bytes then raise exception 'upload identity has different metadata'; end if;
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,sequence_number,event_type,provenance,actor_user_id)
  values(selected_business_id,selected_receipt.id,1,'uploaded','user',(select auth.uid()))
  on conflict (receipt_id) where supersedes_event_id is null do nothing;
  return selected_receipt;
end; $$;

create or replace function public.record_bookkeeping_receipt_extraction(
  p_receipt_id uuid, p_extraction_key text, p_provider text,
  p_merchant text, p_occurred_on date, p_total_amount_cents bigint, p_raw_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; selected_extraction public.bookkeeping_receipt_extractions%rowtype;
  current_event public.bookkeeping_receipt_events%rowtype; candidate_record_id uuid; candidate_count integer;
  selected_link public.bookkeeping_document_links%rowtype; next_event_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select business_id into selected_business_id from public.receipts
    where id=p_receipt_id and user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  if length(btrim(p_extraction_key)) not between 1 and 200 or length(btrim(p_provider)) not between 1 and 100
    then raise exception 'invalid extraction identity'; end if;
  if p_total_amount_cents is not null and p_total_amount_cents <= 0 then raise exception 'receipt total must be positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events where receipt_id=p_receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events s where s.supersedes_event_id=bookkeeping_receipt_events.id);
  if current_event.event_type in ('matched','kept','discarded') then
    return jsonb_build_object('receipt_id',p_receipt_id,'state',current_event.event_type,'record_id',current_event.bookkeeping_record_id);
  end if;
  insert into public.bookkeeping_receipt_extractions(business_id,receipt_id,extraction_key,provider,merchant,occurred_on,total_amount_cents,raw_payload)
  values(selected_business_id,p_receipt_id,btrim(p_extraction_key),btrim(p_provider),left(nullif(btrim(p_merchant),''),500),p_occurred_on,p_total_amount_cents,p_raw_payload)
  on conflict (business_id,receipt_id,extraction_key) do nothing returning * into selected_extraction;
  if selected_extraction.id is null then select * into selected_extraction from public.bookkeeping_receipt_extractions
    where business_id=selected_business_id and receipt_id=p_receipt_id and extraction_key=btrim(p_extraction_key); end if;
  if selected_extraction.merchant is distinct from left(nullif(btrim(p_merchant),''),500)
    or selected_extraction.occurred_on is distinct from p_occurred_on
    or selected_extraction.total_amount_cents is distinct from p_total_amount_cents
    then raise exception 'extraction retry contains different facts'; end if;
  if current_event.event_type='uploaded' then
    insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,extraction_id,provenance,actor_user_id)
    values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'extraction_completed',selected_extraction.id,'user',(select auth.uid()))
    returning id into next_event_id;
    select * into current_event from public.bookkeeping_receipt_events where id=next_event_id;
  end if;
  if p_provider <> 'customer' and p_occurred_on is not null and p_total_amount_cents is not null and p_merchant is not null then
    select count(*), (array_agg(records.id order by records.id))[1] into candidate_count,candidate_record_id
    from public.financial_transactions ft
    join public.bookkeeping_financial_sources fs on fs.financial_transaction_id=ft.id and fs.revoked_at is null
    join public.bookkeeping_records records on records.id=fs.bookkeeping_record_id
    where ft.business_id=selected_business_id and ft.transaction_date=p_occurred_on
      and ft.amount_cents=-p_total_amount_cents
      and regexp_replace(lower(coalesce(ft.merchant_name,ft.original_description,'')),'[^a-z0-9]+','','g') =
          regexp_replace(lower(p_merchant),'[^a-z0-9]+','','g');
    if candidate_count=1 then
      selected_link := public.attach_bookkeeping_receipt_with_documentation(candidate_record_id,p_receipt_id);
      insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,
        bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance)
      values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'matched',candidate_record_id,
        selected_link.id,selected_extraction.id,'automation');
      return jsonb_build_object('receipt_id',p_receipt_id,'state','matched','record_id',candidate_record_id);
    end if;
  end if;
  return jsonb_build_object('receipt_id',p_receipt_id,'state','needs_attention');
end; $$;

create or replace function public.attach_bookkeeping_receipt_journey(
  p_bookkeeping_record_id uuid, p_receipt_id uuid
) returns public.bookkeeping_document_links language plpgsql security definer set search_path = '' as $$
declare selected_link public.bookkeeping_document_links%rowtype; current_event public.bookkeeping_receipt_events%rowtype;
  selected_business_id uuid; extraction_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select coalesce(r.business_id,b.id) into selected_business_id from public.receipts r
    join public.businesses b on b.owner_user_id=r.user_id
    where r.id=p_receipt_id and r.user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  update public.receipts set business_id=selected_business_id where id=p_receipt_id and business_id is null;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events where receipt_id=p_receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events s where s.supersedes_event_id=bookkeeping_receipt_events.id) for update;
  if current_event.id is null then
    insert into public.bookkeeping_receipt_events(business_id,receipt_id,sequence_number,event_type,provenance,actor_user_id)
    values(selected_business_id,p_receipt_id,1,'uploaded','user',(select auth.uid())) returning * into current_event;
  end if;
  if current_event.event_type='matched' and current_event.bookkeeping_record_id=p_bookkeeping_record_id then
    select * into selected_link from public.bookkeeping_document_links where id=current_event.bookkeeping_document_link_id;
    return selected_link;
  end if;
  if current_event.event_type in ('kept','discarded','matched') then raise exception 'receipt has already been completed'; end if;
  selected_link := public.attach_bookkeeping_receipt_with_documentation(p_bookkeeping_record_id,p_receipt_id);
  select id into extraction_id from public.bookkeeping_receipt_extractions where receipt_id=p_receipt_id order by created_at desc,id desc limit 1;
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,
    bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,actor_user_id)
  values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'matched',p_bookkeeping_record_id,
    selected_link.id,extraction_id,'user',(select auth.uid()));
  return selected_link;
end; $$;

create or replace function public.revoke_bookkeeping_receipt_journey(
  p_document_link_id uuid, p_reason text
) returns public.bookkeeping_document_links language plpgsql security definer set search_path = '' as $$
declare selected_link public.bookkeeping_document_links%rowtype; current_event public.bookkeeping_receipt_events%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select links.* into selected_link from public.bookkeeping_document_links links
    join public.businesses b on b.id=links.business_id where links.id=p_document_link_id and b.owner_user_id=(select auth.uid());
  if selected_link.id is null then raise exception 'document link unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(selected_link.receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events where receipt_id=selected_link.receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events s where s.supersedes_event_id=bookkeeping_receipt_events.id) for update;
  if current_event.event_type='kept' then raise exception 'receipt-only source evidence cannot be removed'; end if;
  if selected_link.revoked_at is not null then return selected_link; end if;
  selected_link := public.revoke_bookkeeping_receipt_with_documentation(p_document_link_id,p_reason);
  if current_event.event_type='matched' and current_event.bookkeeping_document_link_id=p_document_link_id then
    insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,provenance,actor_user_id,context)
    values(current_event.business_id,current_event.receipt_id,current_event.id,current_event.sequence_number+1,'unmatched','user',(select auth.uid()),
      jsonb_build_object('revokedDocumentLinkId',p_document_link_id));
  end if;
  return selected_link;
end; $$;

create or replace function public.keep_unmatched_bookkeeping_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; current_event public.bookkeeping_receipt_events%rowtype;
  extraction public.bookkeeping_receipt_extractions%rowtype; selected_record public.bookkeeping_records%rowtype;
  selected_link public.bookkeeping_document_links%rowtype; decision_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select business_id into selected_business_id from public.receipts where id=p_receipt_id and user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events where receipt_id=p_receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events s where s.supersedes_event_id=bookkeeping_receipt_events.id) for update;
  if current_event.event_type='kept' then return jsonb_build_object('receipt_id',p_receipt_id,'state','kept','record_id',current_event.bookkeeping_record_id); end if;
  if current_event.event_type in ('matched','discarded') then raise exception 'receipt has already been completed'; end if;
  select * into extraction from public.bookkeeping_receipt_extractions where business_id=selected_business_id and receipt_id=p_receipt_id
    order by created_at desc,id desc limit 1;
  if extraction.total_amount_cents is null or extraction.occurred_on is null then raise exception 'receipt amount and date are required before keeping'; end if;
  selected_record := public.ensure_bookkeeping_record(selected_business_id,'receipt',null,'user',
    concat('receipt:',p_receipt_id),-extraction.total_amount_cents,'USD',extraction.occurred_on);
  decision_id := public.ensure_initial_bookkeeping_decision(selected_business_id,selected_record.id);
  selected_link := public.attach_bookkeeping_receipt_with_documentation(selected_record.id,p_receipt_id);
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,
    bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,actor_user_id,context)
  values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'kept',selected_record.id,
    selected_link.id,extraction.id,'user',(select auth.uid()),jsonb_build_object('paymentMethod','unknown'));
  return jsonb_build_object('receipt_id',p_receipt_id,'state','kept','record_id',selected_record.id,'decision_id',decision_id);
end; $$;

create or replace function public.discard_unmatched_bookkeeping_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; current_event public.bookkeeping_receipt_events%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select business_id into selected_business_id from public.receipts where id=p_receipt_id and user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events where receipt_id=p_receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events s where s.supersedes_event_id=bookkeeping_receipt_events.id) for update;
  if current_event.event_type='discarded' then return jsonb_build_object('receipt_id',p_receipt_id,'state','discarded'); end if;
  if current_event.event_type in ('matched','kept') then raise exception 'receipt has already been completed'; end if;
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,provenance,actor_user_id)
  values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'discarded','user',(select auth.uid()));
  return jsonb_build_object('receipt_id',p_receipt_id,'state','discarded');
end; $$;

create or replace function public.keep_unmatched_bookkeeping_receipt_with_facts(
  p_receipt_id uuid, p_merchant text, p_occurred_on date, p_total_amount_cents bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if length(btrim(p_merchant)) not between 1 and 500 or p_occurred_on is null
    or p_total_amount_cents is null or p_total_amount_cents <= 0
  then raise exception 'merchant, date, and positive receipt total are required'; end if;
  perform public.record_bookkeeping_receipt_extraction(
    p_receipt_id,'customer:v1','customer',btrim(p_merchant),p_occurred_on,p_total_amount_cents,null
  );
  return public.keep_unmatched_bookkeeping_receipt(p_receipt_id);
end; $$;

revoke all on function public.register_bookkeeping_receipt(uuid,text,text,text,text,integer) from public,anon;
revoke all on function public.record_bookkeeping_receipt_extraction(uuid,text,text,text,date,bigint,jsonb) from public,anon;
revoke all on function public.keep_unmatched_bookkeeping_receipt(uuid) from public,anon;
revoke all on function public.discard_unmatched_bookkeeping_receipt(uuid) from public,anon;
revoke all on function public.keep_unmatched_bookkeeping_receipt_with_facts(uuid,text,date,bigint) from public,anon;
revoke all on function public.attach_bookkeeping_receipt_journey(uuid,uuid) from public,anon;
revoke all on function public.revoke_bookkeeping_receipt_journey(uuid,text) from public,anon;
grant execute on function public.register_bookkeeping_receipt(uuid,text,text,text,text,integer) to authenticated;
grant execute on function public.record_bookkeeping_receipt_extraction(uuid,text,text,text,date,bigint,jsonb) to authenticated;
grant execute on function public.keep_unmatched_bookkeeping_receipt(uuid) to authenticated;
grant execute on function public.discard_unmatched_bookkeeping_receipt(uuid) to authenticated;
grant execute on function public.keep_unmatched_bookkeeping_receipt_with_facts(uuid,text,date,bigint) to authenticated;
grant execute on function public.attach_bookkeeping_receipt_journey(uuid,uuid) to authenticated;
grant execute on function public.revoke_bookkeeping_receipt_journey(uuid,text) to authenticated;
revoke execute on function public.attach_bookkeeping_receipt_with_documentation(uuid,uuid) from authenticated;
revoke execute on function public.revoke_bookkeeping_receipt_with_documentation(uuid,text) from authenticated;

create or replace function public.protect_canonical_receipt_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.bookkeeping_receipt_events where receipt_id=old.id)
    then raise exception 'canonical receipt document metadata is immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger receipts_protect_canonical_history before update or delete on public.receipts
  for each row execute function public.protect_canonical_receipt_row();
revoke insert on public.receipts from authenticated;

comment on table public.bookkeeping_receipt_events is 'Append-only canonical lifecycle for newly uploaded receipt evidence.';
comment on table public.bookkeeping_receipt_extractions is 'Append-only derived OCR facts; never a customer or bookkeeping conclusion.';
