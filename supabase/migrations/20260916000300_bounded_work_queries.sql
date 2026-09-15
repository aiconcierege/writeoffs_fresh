-- Bound work queries before hydration. Explicit owner + MFA checks are repeated
-- inside this database boundary; no caller can supply a Business ID.
create function public.list_customer_transaction_work(p_view text default 'all',p_historical boolean default false,
 p_offset integer default 0,p_query text default '',p_start date default null,p_end date default null,
 p_category text default null,p_account uuid default null)
returns setof public.customer_transaction_work language plpgsql stable security definer set search_path='' as $$
declare bid uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'verified session required';end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if bid is null or p_view not in ('all','receipts','receipt-only','review') or p_offset not between 0 and 100000
  or length(coalesce(p_query,''))>100 then raise exception 'invalid work scope';end if;
 return query select w.* from public.customer_transaction_work w where w.business_id=bid
  and (p_view<>'receipts' or (w.amount_cents<0 and not w.has_receipt and not w.receipt_unavailable
    and w.source_kind='financial_transaction' and w.bookkeeping_nature in ('expense','unresolved') and w.treatment not in ('personal','excluded')))
  and (p_view<>'receipt-only' or (w.has_receipt and w.account_id is null and w.source_kind<>'legacy'))
  and (p_view<>'review' or (w.needs_fact and w.treatment not in ('personal','excluded')))
  and (not p_historical or (w.historical and not w.sweep_reviewed and w.source_kind='financial_transaction' and w.treatment not in ('personal','excluded')))
  and (coalesce(p_query,'')='' or strpos(lower(w.merchant||' '||w.description),lower(p_query))>0)
  and (p_start is null or w.activity_date>=p_start) and (p_end is null or w.activity_date<=p_end)
  and (p_category is null or w.category_key=p_category) and (p_account is null or w.account_id=p_account)
 order by w.activity_date desc,w.record_id offset p_offset limit 51;
end; $$;
revoke all on function public.list_customer_transaction_work(text,boolean,integer,text,date,date,text,uuid) from public,anon;
grant execute on function public.list_customer_transaction_work(text,boolean,integer,text,date,date,text,uuid) to authenticated;

create function public.customer_guided_work_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bid uuid; receipts boolean; history boolean; limitations boolean;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'verified session required';end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if bid is null then raise exception 'business unavailable';end if;
 select exists(select 1 from public.customer_transaction_work w where w.business_id=bid and w.amount_cents<0
  and not w.has_receipt and not w.receipt_unavailable and w.source_kind='financial_transaction'
  and w.bookkeeping_nature in ('expense','unresolved') and w.treatment not in ('personal','excluded')) into receipts;
 select exists(select 1 from public.customer_transaction_work w where w.business_id=bid and w.historical and not w.sweep_reviewed
  and w.source_kind='financial_transaction' and w.treatment not in ('personal','excluded')) into history;
 select exists(select 1 from public.customer_transaction_work w where w.business_id=bid and w.historical_documentation
  and w.treatment not in ('personal','excluded')) into limitations;
 return jsonb_build_object('missingReceipts',receipts,'historicalReview',history,'documentationLimitations',limitations);
end; $$;
revoke all on function public.customer_guided_work_summary() from public,anon;
grant execute on function public.customer_guided_work_summary() to authenticated;
