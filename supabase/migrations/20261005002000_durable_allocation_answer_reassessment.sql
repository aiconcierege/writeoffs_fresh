-- Persist follow-up work in the same transaction as a reusable allocation answer.
-- The API can acknowledge supported ordinary phone/internet answers before the
-- expensive evidence read; the existing leased worker remains recovery authority.
create function public.queue_answered_service_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.event_type='answered' and new.fact_type in('phone_business_use_percentage','internet_business_use_percentage')
  and new.bookkeeping_record_id is not null then
  perform public.request_bookkeeping_processing(new.business_id,new.bookkeeping_record_id,'deduction_fact_changed',
   'deduction-intelligence:v1:answer:'||new.id::text||':record:'||new.bookkeeping_record_id::text);
 end if;
 return new;
end; $$;
revoke all on function public.queue_answered_service_allocation() from public,anon,authenticated;
create trigger queue_answered_service_allocation after insert on public.deduction_attention_events
 for each row execute function public.queue_answered_service_allocation();
