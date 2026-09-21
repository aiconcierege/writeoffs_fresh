-- One tenant-scoped evidence read for Home, Check-in and Reports. No monetary calculations.
create or replace function public.read_customer_source_coverage(p_start date default null,p_end date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bid uuid; scope jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'Verified session required' using errcode='42501';end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if bid is null then raise exception 'Business unavailable' using errcode='42501';end if;
 scope:=public.read_authorized_bookkeeping_scope(bid);
 return jsonb_build_object('authorizedStart',scope->>'authorizedStart','requestedStart',p_start,'through',least(p_end,current_date),
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.display_name,'mask',a.mask_last_four,
   'provider',a.provider,'connected',a.connection_status='active',
   'bankFrom',(select min(v.transaction_date) from public.plaid_account_sources s join public.plaid_transaction_versions v on v.plaid_account_source_id=s.id
      where s.financial_account_id=a.id and s.business_id=bid and v.business_id=bid and v.event_type<>'removed'
       and not exists(select 1 from public.plaid_transaction_versions n where n.supersedes_version_id=v.id)),
   'bankThrough',(select max(i.last_successful_sync_at)::date from public.plaid_account_sources s join public.plaid_items i on i.id=s.plaid_item_record_id
      where s.financial_account_id=a.id and s.business_id=bid and i.business_id=bid),
   'quarantined',(select count(*) from public.plaid_account_sources s join public.plaid_transaction_versions v on v.plaid_account_source_id=s.id
      where s.financial_account_id=a.id and s.business_id=bid and v.business_id=bid and v.rejection_reason is not null
       and (v.transaction_date is null or (v.transaction_date>=greatest(p_start,(scope->>'authorizedStart')::date) and v.transaction_date<=p_end))
       and not exists(select 1 from public.plaid_transaction_versions n where n.supersedes_version_id=v.id)),
   'statements',coalesce((select jsonb_agg(jsonb_build_object('from',p.period_start,'through',p.period_end,'validated',p.validation_status='validated' and p.ambiguous_row_count=0))
      from public.statement_periods p left join public.current_financial_account_equivalence_links l on l.statement_account_id=p.financial_account_id and l.business_id=p.business_id
      where p.business_id=bid and coalesce(l.target_account_id,p.financial_account_id)=a.id),'[]'::jsonb)
 )) from public.financial_accounts a where a.business_id=bid and a.archived_at is null
   and not exists(select 1 from public.current_financial_account_equivalence_links l where l.business_id=bid and l.statement_account_id=a.id)), '[]'::jsonb));
end $$;
revoke all on function public.read_customer_source_coverage(date,date) from public,anon,service_role;
grant execute on function public.read_customer_source_coverage(date,date) to authenticated;
