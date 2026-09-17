-- Minimum activation saves timezone and existing required business facts atomically.
-- No account connection/use, mileage, receipt, or transaction answer is required.
create function public.complete_minimum_onboarding(p_business_id uuid,p_timezone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owned_id uuid; completion jsonb;
begin
  owned_id:=public.require_customer_setup_owner();
  if owned_id is distinct from p_business_id then raise exception 'Business unavailable'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone'; end if;
  completion:=public.complete_business_onboarding_v3(owned_id);
  -- Preserve any existing customer-selected timezone; this is not a settings edit.
  update public.business_customer_setup set timezone_name=coalesce(timezone_name,p_timezone)
    where business_id=owned_id;
  return completion || jsonb_build_object('destination','/home');
end; $$;
revoke all on function public.complete_minimum_onboarding(uuid,text) from public,anon;
grant execute on function public.complete_minimum_onboarding(uuid,text) to authenticated;
