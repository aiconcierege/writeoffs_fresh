-- R2: cached page extraction and customer-confirmed source-account equivalence.

create table public.statement_page_extractions(
  id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
  document_id uuid not null,page_number integer not null,extraction_version text not null,method text not null,
  extraction_status text not null,normalized_text text,provider text,duration_ms integer,created_at timestamptz not null default now(),
  constraint statement_page_document_business_fkey foreign key(document_id,business_id) references public.business_documents(id,business_id) on delete restrict,
  constraint statement_page_number_check check(page_number between 1 and 500),
  constraint statement_page_method_check check(method in ('native_text','ocr')),
  constraint statement_page_status_check check(extraction_status in ('usable','blank','unreadable')),
  constraint statement_page_text_check check(normalized_text is null or length(normalized_text)<=50000),
  constraint statement_page_duration_check check(duration_ms is null or duration_ms between 0 and 120000),
  constraint statement_page_identity_unique unique(business_id,document_id,page_number,extraction_version)
);
alter table public.statement_page_extractions enable row level security;
revoke all on public.statement_page_extractions from public,anon,authenticated;
grant select,insert on public.statement_page_extractions to service_role;

create table public.financial_account_equivalence_links(
  id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
  statement_account_id uuid not null,target_account_id uuid not null,request_key text not null,effective_on date not null default current_date,
  provenance text not null default 'user',actor_user_id uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
  constraint account_link_statement_business_fkey foreign key(statement_account_id,business_id) references public.financial_accounts(id,business_id) on delete restrict,
  constraint account_link_target_business_fkey foreign key(target_account_id,business_id) references public.financial_accounts(id,business_id) on delete restrict,
  constraint account_link_distinct_check check(statement_account_id<>target_account_id),
  constraint account_link_request_unique unique(business_id,request_key),constraint account_link_id_business_unique unique(id,business_id)
);
create table public.financial_account_equivalence_events(
  id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
  link_id uuid not null,supersedes_event_id uuid,event_type text not null,reason text,provenance text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
  constraint account_link_event_link_business_fkey foreign key(link_id,business_id) references public.financial_account_equivalence_links(id,business_id) on delete restrict,
  constraint account_link_event_supersedes_fkey foreign key(supersedes_event_id) references public.financial_account_equivalence_events(id) on delete restrict,
  constraint account_link_event_type_check check(event_type in ('confirmed','unlinked')),
  constraint account_link_event_root_unique unique(link_id,supersedes_event_id)
);
create unique index account_link_event_root_idx on public.financial_account_equivalence_events(link_id) where supersedes_event_id is null;
create unique index account_link_event_successor_idx on public.financial_account_equivalence_events(supersedes_event_id) where supersedes_event_id is not null;
alter table public.financial_account_equivalence_links enable row level security;
alter table public.financial_account_equivalence_events enable row level security;
create policy account_links_select_own on public.financial_account_equivalence_links for select to authenticated using
  (exists(select 1 from public.businesses where id=business_id and owner_user_id=(select auth.uid())));
create policy account_link_events_select_own on public.financial_account_equivalence_events for select to authenticated using
  (exists(select 1 from public.businesses where id=business_id and owner_user_id=(select auth.uid())));
revoke all on public.financial_account_equivalence_links,public.financial_account_equivalence_events from public,anon,authenticated;
grant select on public.financial_account_equivalence_links,public.financial_account_equivalence_events to authenticated;
grant all on public.financial_account_equivalence_links,public.financial_account_equivalence_events to service_role;

create view public.current_financial_account_equivalence_links with(security_invoker=true) as
select link.*,event.id as event_id,event.created_at as confirmed_at from public.financial_account_equivalence_links link
join public.financial_account_equivalence_events event on event.link_id=link.id and event.event_type='confirmed'
where not exists(select 1 from public.financial_account_equivalence_events successor where successor.supersedes_event_id=event.id);
grant select on public.current_financial_account_equivalence_links to authenticated,service_role;

create table public.bookkeeping_source_convergences(
  id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
  account_link_id uuid not null,survivor_record_id uuid not null,absorbed_record_id uuid not null,evidence_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint source_convergence_link_business_fkey foreign key(account_link_id,business_id) references public.financial_account_equivalence_links(id,business_id) on delete restrict,
  constraint source_convergence_survivor_business_fkey foreign key(survivor_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict,
  constraint source_convergence_absorbed_business_fkey foreign key(absorbed_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict,
  constraint source_convergence_distinct_check check(survivor_record_id<>absorbed_record_id),
  constraint source_convergence_hash_check check(evidence_fingerprint~'^[a-f0-9]{64}$'),
  constraint source_convergence_identity_unique unique(business_id,account_link_id,evidence_fingerprint),constraint source_convergence_id_business_unique unique(id,business_id)
);
create table public.bookkeeping_source_convergence_events(
  id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
  convergence_id uuid not null,supersedes_event_id uuid,event_type text not null,reason text not null,created_at timestamptz not null default now(),
  constraint source_convergence_event_parent_fkey foreign key(convergence_id,business_id) references public.bookkeeping_source_convergences(id,business_id) on delete restrict,
  constraint source_convergence_event_supersedes_fkey foreign key(supersedes_event_id) references public.bookkeeping_source_convergence_events(id) on delete restrict,
  constraint source_convergence_event_type_check check(event_type in ('activated','reversed'))
);
create unique index source_convergence_event_root_idx on public.bookkeeping_source_convergence_events(convergence_id) where supersedes_event_id is null;
create unique index source_convergence_event_successor_idx on public.bookkeeping_source_convergence_events(supersedes_event_id) where supersedes_event_id is not null;
alter table public.bookkeeping_source_convergences enable row level security;
alter table public.bookkeeping_source_convergence_events enable row level security;
create policy source_convergences_select_own on public.bookkeeping_source_convergences for select to authenticated using
  (exists(select 1 from public.businesses where id=business_id and owner_user_id=(select auth.uid())));
create policy source_convergence_events_select_own on public.bookkeeping_source_convergence_events for select to authenticated using
  (exists(select 1 from public.businesses where id=business_id and owner_user_id=(select auth.uid())));
revoke all on public.bookkeeping_source_convergences,public.bookkeeping_source_convergence_events from public,anon,authenticated;
grant select on public.bookkeeping_source_convergences,public.bookkeeping_source_convergence_events to authenticated;
grant all on public.bookkeeping_source_convergences,public.bookkeeping_source_convergence_events to service_role;

create view public.current_bookkeeping_source_convergences with(security_invoker=true) as
select convergence.business_id,convergence.id as convergence_id,event.id as convergence_event_id,convergence.account_link_id,
  convergence.survivor_record_id,convergence.absorbed_record_id,convergence.evidence_fingerprint
from public.bookkeeping_source_convergences convergence join public.bookkeeping_source_convergence_events event
  on event.convergence_id=convergence.id and event.event_type='activated'
where not exists(select 1 from public.bookkeeping_source_convergence_events successor where successor.supersedes_event_id=event.id);
grant select on public.current_bookkeeping_source_convergences to authenticated,service_role;

create or replace function public.reject_statement_r2_history_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'statement account and convergence history is append-only'; end $$;
create trigger account_links_immutable before update or delete on public.financial_account_equivalence_links for each row execute function public.reject_statement_r2_history_mutation();
create trigger account_link_events_immutable before update or delete on public.financial_account_equivalence_events for each row execute function public.reject_statement_r2_history_mutation();
create trigger source_convergences_immutable before update or delete on public.bookkeeping_source_convergences for each row execute function public.reject_statement_r2_history_mutation();
create trigger source_convergence_events_immutable before update or delete on public.bookkeeping_source_convergence_events for each row execute function public.reject_statement_r2_history_mutation();
create trigger statement_page_extractions_immutable before update or delete on public.statement_page_extractions for each row execute function public.reject_statement_r2_history_mutation();

create or replace function public.reconcile_confirmed_statement_account(p_link_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare link public.current_financial_account_equivalence_links%rowtype; candidate record; created_count integer:=0; survivor uuid; absorbed uuid; evidence text; selected_convergence_id uuid;
begin
  select * into link from public.current_financial_account_equivalence_links where id=p_link_id;
  if not found then return 0; end if;
  for candidate in
    with statement_rows as(select observation.*,source.bookkeeping_record_id from public.statement_transaction_observations observation
      join public.bookkeeping_financial_sources source on source.financial_transaction_id=observation.financial_transaction_id and source.revoked_at is null
      join public.financial_transactions transaction on transaction.id=observation.financial_transaction_id
      where observation.business_id=link.business_id and transaction.financial_account_id=link.statement_account_id),
    target_rows as(select transaction.*,source.bookkeeping_record_id,upper(regexp_replace(transaction.original_description,'\\s+',' ','g')) normalized
      from public.financial_transactions transaction join public.bookkeeping_financial_sources source
      on source.financial_transaction_id=transaction.id and source.revoked_at is null
      where transaction.business_id=link.business_id and transaction.financial_account_id=link.target_account_id and not transaction.pending)
    select statement_rows.bookkeeping_record_id statement_record,target_rows.bookkeeping_record_id target_record,
      statement_rows.evidence_fingerprint from statement_rows join target_rows on target_rows.transaction_date=statement_rows.transaction_date
      and target_rows.amount_cents=statement_rows.amount_cents and target_rows.currency=statement_rows.currency
      and target_rows.normalized=statement_rows.normalized_description
    where (select count(*) from statement_rows other where other.transaction_date=statement_rows.transaction_date and other.amount_cents=statement_rows.amount_cents
      and other.currency=statement_rows.currency and other.normalized_description=statement_rows.normalized_description)=1
      and (select count(*) from target_rows other where other.transaction_date=target_rows.transaction_date and other.amount_cents=target_rows.amount_cents
      and other.currency=target_rows.currency and other.normalized=target_rows.normalized)=1
  loop
    survivor:=candidate.target_record;absorbed:=candidate.statement_record;evidence:=candidate.evidence_fingerprint;
    if not exists(select 1 from public.current_bookkeeping_source_convergences where business_id=link.business_id
      and (survivor_record_id in(survivor,absorbed) or absorbed_record_id in(survivor,absorbed)))
      and not exists(select 1 from public.current_bookkeeping_record_convergences where business_id=link.business_id
      and (survivor_record_id in(survivor,absorbed) or absorbed_record_id in(survivor,absorbed)))
      and not exists(select 1 from public.current_bookkeeping_compound_components where business_id=link.business_id and bookkeeping_record_id in(survivor,absorbed))
      and not exists(select 1 from public.current_bookkeeping_compound_reconciliations where business_id=link.business_id and anchor_bookkeeping_record_id in(survivor,absorbed))
      and (select count(*) from public.bookkeeping_decisions where business_id=link.business_id and bookkeeping_record_id=survivor)=1
      and (select count(*) from public.bookkeeping_decisions where business_id=link.business_id and bookkeeping_record_id=absorbed)=1 then
      insert into public.bookkeeping_source_convergences(business_id,account_link_id,survivor_record_id,absorbed_record_id,evidence_fingerprint)
      values(link.business_id,link.id,survivor,absorbed,evidence) on conflict do nothing returning id into selected_convergence_id;
      if found then insert into public.bookkeeping_source_convergence_events(business_id,convergence_id,event_type,reason)
        values(link.business_id,selected_convergence_id,'activated','Exact observation match under a customer-confirmed account link.');created_count:=created_count+1; end if;
    end if;
  end loop;
  return created_count;
end $$;

create or replace function public.confirm_statement_account_link(p_statement_account_id uuid,p_target_account_id uuid,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());business uuid;selected_link_id uuid;
begin
  select business_id into business from public.financial_accounts where id=p_statement_account_id and provider='statement' for update;
  if actor is null or not exists(select 1 from public.businesses where id=business and owner_user_id=actor)
    or not exists(select 1 from public.financial_accounts where id=p_target_account_id and business_id=business and provider in('plaid','csv'))
    or length(btrim(coalesce(p_request_key,''))) not between 1 and 200 then raise exception 'account link is unavailable'; end if;
  select id into selected_link_id from public.financial_account_equivalence_links where business_id=business and request_key=btrim(p_request_key);
  if selected_link_id is not null then perform public.reconcile_confirmed_statement_account(selected_link_id);return selected_link_id;end if;
  if exists(select 1 from public.current_financial_account_equivalence_links where business_id=business and statement_account_id=p_statement_account_id)
    then raise exception 'statement account already has a current link';end if;
  insert into public.financial_account_equivalence_links(business_id,statement_account_id,target_account_id,request_key,actor_user_id)
  values(business,p_statement_account_id,p_target_account_id,btrim(p_request_key),actor) returning id into selected_link_id;
  if not exists(select 1 from public.financial_account_equivalence_events event where event.link_id=selected_link_id) then
    insert into public.financial_account_equivalence_events(business_id,link_id,event_type,provenance,actor_user_id) values(business,selected_link_id,'confirmed','user',actor);
  end if;
  perform public.reconcile_confirmed_statement_account(selected_link_id);return selected_link_id;
end $$;

create or replace function public.unlink_statement_account(p_link_id uuid,p_expected_event_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());link public.current_financial_account_equivalence_links%rowtype; convergence record;
begin
  select * into link from public.current_financial_account_equivalence_links where id=p_link_id for update;
  if not found or link.event_id<>p_expected_event_id or not exists(select 1 from public.businesses where id=link.business_id and owner_user_id=actor)
    or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'account link changed; reload before unlinking'; end if;
  if exists(select 1 from public.current_bookkeeping_source_convergences current join public.bookkeeping_decisions decision
      on decision.bookkeeping_record_id in(current.survivor_record_id,current.absorbed_record_id)
      where current.account_link_id=link.id and (decision.provenance<>'system' or decision.supersedes_decision_id is not null))
    then raise exception 'linked activity has dependent customer state'; end if;
  for convergence in select * from public.current_bookkeeping_source_convergences where account_link_id=link.id loop
    insert into public.bookkeeping_source_convergence_events(business_id,convergence_id,supersedes_event_id,event_type,reason)
    values(link.business_id,convergence.convergence_id,convergence.convergence_event_id,'reversed','Account link removed by customer.');end loop;
  insert into public.financial_account_equivalence_events(business_id,link_id,supersedes_event_id,event_type,reason,provenance,actor_user_id)
  values(link.business_id,link.id,link.event_id,'unlinked',btrim(p_reason),'user',actor);return true;
end $$;

revoke execute on function public.reconcile_confirmed_statement_account(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_confirmed_statement_account(uuid) to service_role;
revoke execute on function public.confirm_statement_account_link(uuid,uuid,text),public.unlink_statement_account(uuid,uuid,text) from public,anon;
grant execute on function public.confirm_statement_account_link(uuid,uuid,text),public.unlink_statement_account(uuid,uuid,text) to authenticated;

create or replace function public.reconcile_linked_account_source_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare account_id uuid;active_link record;
begin
  select financial_account_id into account_id from public.financial_transactions where id=new.financial_transaction_id and business_id=new.business_id;
  for active_link in select id from public.current_financial_account_equivalence_links where business_id=new.business_id
    and (statement_account_id=account_id or target_account_id=account_id)
  loop perform public.reconcile_confirmed_statement_account(active_link.id);end loop;return new;
end $$;
create trigger bookkeeping_financial_source_reconcile_statement_link after insert on public.bookkeeping_financial_sources
for each row when(new.financial_transaction_id is not null) execute function public.reconcile_linked_account_source_trigger();

create view public.current_customer_statement_account_candidates with(security_invoker=true) as
select statement.business_id,statement.id as statement_account_id,target.id as target_account_id,target.display_name,target.provider,
  (upper(statement.institution_name)=upper(target.institution_name) and statement.account_type=target.account_type
    and statement.currency=target.currency and statement.mask_last_four is not null and statement.mask_last_four=target.mask_last_four
    and exists(select 1 from public.statement_transaction_observations observation join public.financial_transactions statement_tx
      on statement_tx.id=observation.financial_transaction_id join public.financial_transactions target_tx
      on target_tx.financial_account_id=target.id and target_tx.transaction_date=observation.transaction_date
      and target_tx.amount_cents=observation.amount_cents and target_tx.currency=observation.currency
      and upper(regexp_replace(target_tx.original_description,'\\s+',' ','g'))=observation.normalized_description
      where statement_tx.financial_account_id=statement.id)) as strong_identity
from public.financial_accounts statement join public.financial_accounts target on target.business_id=statement.business_id and target.provider in('plaid','csv')
where statement.provider='statement';
grant select on public.current_customer_statement_account_candidates to authenticated;

create or replace view public.current_customer_statement_status with(security_barrier=true) as
select document.id,document.business_id,document.original_name,document.bytes,document.created_at,
  case when job.state='completed' then 'organized' when job.state='processing' then 'processing'
    when job.state in ('needs_attention','dead_letter') then 'needs_attention' when job.state='unreadable' then 'unreadable' else 'queued' end processing_status,
  job.attempt_count,coalesce(summary.transaction_count,0)::integer transaction_count,summary.institution_name,summary.masked_account,
  summary.account_type,summary.period_start,summary.period_end,summary.financial_account_id as statement_account_id,
  active_link.id as account_link_id,active_link.event_id as account_link_event_id,active_link.target_account_id
from public.business_documents document
left join lateral(select j.* from public.receipt_processing_jobs j where j.document_id=document.id order by j.created_at desc limit 1) job on true
left join lateral(select count(observation.id) transaction_count,max(period.institution_name) institution_name,max(period.masked_account) masked_account,
  max(period.account_type) account_type,min(period.period_start) period_start,max(period.period_end) period_end,max(period.financial_account_id::text)::uuid financial_account_id
  from public.statement_periods period left join public.statement_transaction_observations observation on observation.statement_period_id=period.id
  where period.document_id=document.id) summary on true
left join public.current_financial_account_equivalence_links active_link on active_link.statement_account_id=summary.financial_account_id
where document.owner_user_id=(select auth.uid());
grant select on public.current_customer_statement_status to authenticated;
