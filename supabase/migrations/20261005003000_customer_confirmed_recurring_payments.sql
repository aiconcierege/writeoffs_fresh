-- Reusable customer facts, not merchant-name inference. No historical backfill.
create table public.bookkeeping_recurring_payment_facts (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 account_id uuid not null references public.financial_accounts(id),
 counterparty text not null,
 currency text not null,
 effective_on date not null,
 source_answer_id uuid not null references public.bookkeeping_review_events(id),
 supersedes_id uuid references public.bookkeeping_recurring_payment_facts(id),
 status text not null check(status in ('active','revoked')),
 actor_user_id uuid not null,
 created_at timestamptz not null default now()
);
create unique index recurring_payment_single_successor on public.bookkeeping_recurring_payment_facts(supersedes_id) where supersedes_id is not null;
create unique index recurring_payment_answer_once on public.bookkeeping_recurring_payment_facts(source_answer_id) where status='active';
alter table public.bookkeeping_recurring_payment_facts enable row level security;
revoke all on public.bookkeeping_recurring_payment_facts from public,anon,authenticated;
grant select on public.bookkeeping_recurring_payment_facts to authenticated;
grant all on public.bookkeeping_recurring_payment_facts to service_role;
create policy recurring_payment_owner on public.bookkeeping_recurring_payment_facts for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and auth.jwt()->>'aal'='aal2');
create trigger recurring_payment_immutable before update or delete on public.bookkeeping_recurring_payment_facts
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create view public.current_recurring_payment_facts with(security_invoker=true) as
 select f.* from public.bookkeeping_recurring_payment_facts f where not exists(
  select 1 from public.bookkeeping_recurring_payment_facts newer where newer.supersedes_id=f.id);
grant select on public.current_recurring_payment_facts to authenticated,service_role;

create function public.remember_confirmed_payment() returns trigger
language plpgsql security definer set search_path='' as $$
declare tx public.financial_transactions%rowtype; prior uuid; party text;
begin
 if new.event_type<>'answered' or new.actor_user_id is null or new.answer_payload->>'activity' is distinct from 'earned_money'
  or new.question_context->'understanding'->>'kind' is distinct from 'customer_payment_candidate'
  or new.question_context->'understanding' ? 'invoiceReference' then return new;end if;
 party:=new.question_context->'understanding'->>'counterparty';
 select * into tx from public.financial_transactions where business_id=new.business_id
  and id=(new.question_context->'understanding'->>'sourceId')::uuid;
 if not found or tx.amount_cents<=0 or tx.pending or party is null or party!~'^[A-Z][A-Z0-9 ]{1,35}$'
  or btrim(regexp_replace(upper(tx.original_description),'[^A-Z0-9]+',' ','g')) not in (party||' PAYOUT',party||' MERCHANT SETTLEMENT')
  or not exists(select 1 from public.bookkeeping_financial_sources s where s.business_id=new.business_id
   and s.bookkeeping_record_id=new.bookkeeping_record_id and s.financial_transaction_id=tx.id and s.revoked_at is null)
 then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('recurring-payment:'||new.business_id::text||':'||tx.financial_account_id::text||':'||party,0));
 select id into prior from public.current_recurring_payment_facts where business_id=new.business_id
  and account_id=tx.financial_account_id and counterparty=party and currency=tx.currency;
 insert into public.bookkeeping_recurring_payment_facts(business_id,account_id,counterparty,currency,effective_on,source_answer_id,supersedes_id,status,actor_user_id)
 values(new.business_id,tx.financial_account_id,party,tx.currency,tx.transaction_date,new.id,prior,'active',new.actor_user_id);
 return new;
end;$$;
create trigger remember_confirmed_payment after insert on public.bookkeeping_review_events
 for each row execute function public.remember_confirmed_payment();

create table public.bookkeeping_recurring_payment_dependencies (
 business_id uuid not null references public.businesses(id) on delete cascade,
 bookkeeping_record_id uuid not null references public.bookkeeping_records(id),
 decision_id uuid primary key references public.bookkeeping_decisions(id),
 fact_id uuid not null references public.bookkeeping_recurring_payment_facts(id)
);
alter table public.bookkeeping_recurring_payment_dependencies enable row level security;
revoke all on public.bookkeeping_recurring_payment_dependencies from public,anon,authenticated;
grant all on public.bookkeeping_recurring_payment_dependencies to service_role;

create function public.apply_remembered_payment(p_business uuid,p_record uuid,p_decision uuid,p_fact uuid,p_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare f public.current_recurring_payment_facts%rowtype;
 tx public.financial_transactions%rowtype; d public.bookkeeping_decisions%rowtype; result uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Worker only';end if;
 perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||p_record::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_record::text,41));
 select * into f from public.current_recurring_payment_facts where id=p_fact and business_id=p_business and status='active';
 if not found then raise exception 'Remembered fact changed';end if;
 perform pg_advisory_xact_lock(hashtextextended('recurring-payment:'||p_business::text||':'||f.account_id::text||':'||f.counterparty,0));
 if not exists(select 1 from public.current_recurring_payment_facts where id=p_fact and status='active')then raise exception 'Remembered fact changed';end if;
 select current.* into d from public.bookkeeping_decisions current where current.business_id=p_business
  and current.bookkeeping_record_id=p_record and not exists(select 1 from public.bookkeeping_decisions newer
   where newer.business_id=p_business and newer.supersedes_decision_id=current.id);
 select source.* into strict tx from public.financial_transactions source
  join public.bookkeeping_financial_sources link on link.financial_transaction_id=source.id
   and link.business_id=source.business_id and link.revoked_at is null
  where link.business_id=p_business and link.bookkeeping_record_id=p_record;
 if d.id is distinct from p_decision or d.provenance='user' or d.treatment<>'unresolved' or d.bookkeeping_nature is not null
  or tx.id is null or tx.pending or tx.amount_cents<=0 or tx.currency<>f.currency or tx.financial_account_id<>f.account_id
  or not public.bookkeeping_date_is_active(p_business,tx.transaction_date)
  or tx.transaction_date<f.effective_on
  or btrim(regexp_replace(upper(tx.original_description),'[^A-Z0-9]+',' ','g')) not in (f.counterparty||' PAYOUT',f.counterparty||' MERCHANT SETTLEMENT')
  or public.current_bookkeeping_evidence_fingerprint(p_business,p_record) is distinct from p_evidence
 then raise exception 'Recurring evidence changed';end if;
 result:=public.append_bookkeeping_decision(p_business,p_record,p_decision,'business_income','business','resolved','system',null,
  'Applied the customer-confirmed source of a materially consistent recurring payout.',null,
  jsonb_build_array(jsonb_build_object('kind','business','amount_cents',tx.amount_cents)));
 insert into public.bookkeeping_recurring_payment_dependencies values(p_business,p_record,result,f.id);
 return result;
end;$$;
revoke all on function public.apply_remembered_payment(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_remembered_payment(uuid,uuid,uuid,uuid,text) to service_role;

create function public.stop_remembered_payment(p_fact uuid,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare bid uuid:=public.require_customer_setup_owner(); f public.current_recurring_payment_facts%rowtype;
begin
 if p_request is null then raise exception 'Request required';end if;
 if exists(select 1 from public.bookkeeping_recurring_payment_facts where id=p_request and business_id=bid
  and supersedes_id=p_fact and status='revoked')then return p_request;end if;
 select * into f from public.current_recurring_payment_facts where id=p_fact and business_id=bid and status='active';
 if not found then raise exception 'Remembered fact changed';end if;
 perform pg_advisory_xact_lock(hashtextextended('recurring-payment:'||bid::text||':'||f.account_id::text||':'||f.counterparty,0));
 if not exists(select 1 from public.current_recurring_payment_facts where id=p_fact and status='active')then raise exception 'Remembered fact changed';end if;
 insert into public.bookkeeping_recurring_payment_facts(id,business_id,account_id,counterparty,currency,effective_on,source_answer_id,supersedes_id,status,actor_user_id)
 values(p_request,bid,f.account_id,f.counterparty,f.currency,current_date,f.source_answer_id,f.id,'revoked',auth.uid());
 return p_request;
end;$$;
revoke all on function public.stop_remembered_payment(uuid,uuid) from public,anon;
grant execute on function public.stop_remembered_payment(uuid,uuid) to authenticated;
