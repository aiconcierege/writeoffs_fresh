-- Existing imported/system receipts begin their canonical journey at the
-- customer-authored match. They must not receive a fabricated upload event.

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
    selected_link := public.attach_bookkeeping_receipt_with_documentation(p_bookkeeping_record_id,p_receipt_id);
    select id into extraction_id from public.bookkeeping_receipt_extractions where receipt_id=p_receipt_id order by created_at desc,id desc limit 1;
    insert into public.bookkeeping_receipt_events(business_id,receipt_id,sequence_number,event_type,
      bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,actor_user_id,context)
    values(selected_business_id,p_receipt_id,1,'matched',p_bookkeeping_record_id,selected_link.id,
      extraction_id,'user',(select auth.uid()),jsonb_build_object('schemaVersion',1,
        'uploadProvenance','unavailable','reason','Customer attached an existing receipt.'));
    return selected_link;
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

