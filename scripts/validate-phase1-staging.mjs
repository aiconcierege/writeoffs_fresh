// Rollback-only integration checks. Never select a real customer or a Production project.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
const fixture=JSON.parse(await readFile('/private/tmp/writeoffs-check-in-fixture.json','utf8'))
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging')
for(const id of [fixture.userId,fixture.businessId])assert(/^[0-9a-f-]{36}$/.test(id))
const query=`begin;
set local statement_timeout='30s';
do $$ begin if not exists(select 1 from auth.users where id='${fixture.userId}' and raw_user_meta_data->>'synthetic_check_in_validation'='true') then raise exception 'synthetic fixture required'; end if; end $$;
delete from public.customer_catch_up_orders where business_id='${fixture.businessId}';
delete from public.historical_mileage_facts where business_id='${fixture.businessId}';
update public.business_customer_setup set joined_month='2026-09-01',grandfathered_start_date=null where business_id='${fixture.businessId}';
select set_config('request.jwt.claims','{"sub":"${fixture.userId}","aal":"aal1","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.business_customer_setup) then raise exception 'unverified read allowed'; end if;
 begin perform public.choose_customer_start_month('2026-09-01');raise exception 'unverified mutation allowed';exception when others then if sqlerrm='unverified mutation allowed' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"${fixture.userId}","aal":"aal2","role":"authenticated"}',true);
set local role authenticated;
do $$ declare quote jsonb; first_order uuid; first_id uuid; next_id uuid; begin
 if exists(select 1 from public.business_customer_setup where business_id<>'${fixture.businessId}') then raise exception 'tenant read escaped';end if;
 quote:=public.choose_customer_start_month('2026-09-01');if (quote->>'totalCents')::int<>0 then raise exception 'current charged';end if;
 quote:=public.choose_customer_start_month('2026-08-01');if (quote->>'totalCents')::int<>0 then raise exception 'prior charged';end if;
 quote:=public.choose_customer_start_month('2026-01-01');if (quote->>'totalCents')::int<>14000 or quote->>'orderId' is not null then raise exception 'quote or consent failed';end if;
 if exists(select 1 from public.customer_catch_up_orders) then raise exception 'silent order';end if;
 begin perform public.choose_customer_start_month('2026-01-01',true,true,100);raise exception 'wrong amount accepted';exception when others then if sqlerrm='wrong amount accepted' then raise;end if;end;
 quote:=public.choose_customer_start_month('2026-01-01',true,true,14000);first_order:=(quote->>'orderId')::uuid;
 quote:=public.choose_customer_start_month('2026-01-01',true,true,14000);if (quote->>'orderId')::uuid<>first_order then raise exception 'duplicate order';end if;
 begin perform public.choose_customer_start_month('2026-02-01',true,true,12000);raise exception 'parallel unpaid order';exception when unique_violation then null;end;
 first_id:=public.record_historical_mileage('deferred',null,null,'11111111-1111-4111-8111-111111111111',null);
 next_id:=public.record_historical_mileage('deferred',null,null,'11111111-1111-4111-8111-111111111111',null);if next_id<>first_id then raise exception 'duplicate mileage';end if;
 if not exists(select 1 from public.current_historical_mileage where id=first_id and answer='deferred' and periods is null) then raise exception 'deferral changed';end if;
 begin perform public.record_historical_mileage('entered','[{"from":"2026-01-01","milesMilli":1000}]',null,'33333333-3333-4333-8333-333333333333',first_id);raise exception 'missing period accepted';exception when others then if sqlerrm='missing period accepted' then raise;end if;end;
 next_id:=public.record_historical_mileage('zero',null,null,'22222222-2222-4222-8222-222222222222',first_id);
 if not exists(select 1 from public.current_historical_mileage where id=next_id and answer='zero') or exists(select 1 from public.current_historical_mileage where id=first_id) then raise exception 'history projection failed';end if;
end $$;
reset role;
rollback;`
const token=(await readFile(join(homedir(),'.supabase','access-token'),'utf8')).trim()
const response=await fetch('https://api.supabase.com/v1/projects/sgrqrrxrlglhjuetdtps/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(45000)})
if(!response.ok){console.error('Phase 1 rollback-only database certification failed.');process.exitCode=1}else console.log('Passed: MFA reads/writes, tenant isolation, month pricing, consent, retry/concurrent-order protection, mileage validation/deferral/history. All fixture changes rolled back.')
