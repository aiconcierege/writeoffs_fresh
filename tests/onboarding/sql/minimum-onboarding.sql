-- Run with the new migration inside a transaction; all fixture data rolls back.
insert into auth.users(id,email,raw_user_meta_data) values
 ('8777c5e3-b615-4acd-a4dd-01056a1251dd','minimum-onboarding-a@example.invalid','{}'),
 ('be9ec1e8-7d61-422c-a20c-60d589440b04','minimum-onboarding-b@example.invalid','{}');
update public.businesses set id='8205b373-c03f-4099-a3ef-1b57b48fff2d' where owner_user_id='8777c5e3-b615-4acd-a4dd-01056a1251dd';
update public.businesses set id='6fe00fc0-16f9-4966-b4b5-ccad657aedfc' where owner_user_id='be9ec1e8-7d61-422c-a20c-60d589440b04';
select public.create_business_membership_grant('8205b373-c03f-4099-a3ef-1b57b48fff2d','business',now()-interval '1 day',null,'minimum-test-a','Synthetic onboarding test','admin',null);
select public.create_business_membership_grant('6fe00fc0-16f9-4966-b4b5-ccad657aedfc','business',now()-interval '1 day',null,'minimum-test-b','Synthetic onboarding test','admin',null);
insert into public.business_customer_setup(business_id,joined_month) values ('8205b373-c03f-4099-a3ef-1b57b48fff2d',date_trunc('month',current_date)::date),('6fe00fc0-16f9-4966-b4b5-ccad657aedfc',date_trunc('month',current_date)::date);
update public.businesses set business_description='Synthetic services',business_profile_context='general',schedule_c_eligibility='yes',
 business_stage='existing',business_start_month='2020-01-01',uses_customer_job_materials='no',keeps_future_sale_merchandise='no',
 catch_up_start_date=date_trunc('month',current_date)::date,onboarding_start_method='statement_uploads',onboarding_state='in_progress'
 where id in ('8205b373-c03f-4099-a3ef-1b57b48fff2d','6fe00fc0-16f9-4966-b4b5-ccad657aedfc');
update public.businesses set onboarding_start_method='connected_financial_accounts' where id='6fe00fc0-16f9-4966-b4b5-ccad657aedfc';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"8777c5e3-b615-4acd-a4dd-01056a1251dd","role":"authenticated","aal":"aal2"}',true);
do $$ declare first_result jsonb; second_result jsonb; begin
 first_result:=public.complete_minimum_onboarding('8205b373-c03f-4099-a3ef-1b57b48fff2d','America/Phoenix');
 second_result:=public.complete_minimum_onboarding('8205b373-c03f-4099-a3ef-1b57b48fff2d','America/New_York');
 if first_result->>'destination'<>'/home' or first_result<>second_result then raise exception 'completion not idempotent'; end if;
 if (select timezone_name from public.business_customer_setup where business_id='8205b373-c03f-4099-a3ef-1b57b48fff2d')<>'America/Phoenix' then raise exception 'timezone overwritten'; end if;
 begin
  perform public.complete_minimum_onboarding('6fe00fc0-16f9-4966-b4b5-ccad657aedfc','America/Phoenix');
  raise exception 'cross tenant permitted';
 exception when raise_exception then if sqlerrm<>'Business unavailable' then raise; end if; end;
 begin
  perform public.complete_minimum_onboarding('8205b373-c03f-4099-a3ef-1b57b48fff2d','not/a-zone');
  raise exception 'invalid zone permitted';
 exception when raise_exception then if sqlerrm<>'Invalid timezone' then raise; end if; end;
end; $$;
select set_config('request.jwt.claims','{"sub":"be9ec1e8-7d61-422c-a20c-60d589440b04","role":"authenticated","aal":"aal1"}',true);
do $$ begin
 begin
  perform public.complete_minimum_onboarding('6fe00fc0-16f9-4966-b4b5-ccad657aedfc','America/Phoenix');
  raise exception 'MFA bypass';
 exception when raise_exception then if sqlerrm<>'verified session required' then raise; end if; end;
end; $$;
select set_config('request.jwt.claims','{"sub":"be9ec1e8-7d61-422c-a20c-60d589440b04","role":"authenticated","aal":"aal2"}',true);
do $$ begin
 if public.complete_minimum_onboarding('6fe00fc0-16f9-4966-b4b5-ccad657aedfc','America/Phoenix')->>'destination'<>'/home' then raise exception 'connected choice did not reach Home'; end if;
 if exists(select 1 from public.financial_accounts where business_id='6fe00fc0-16f9-4966-b4b5-ccad657aedfc') then raise exception 'test unexpectedly connected'; end if;
end; $$;
reset role;
select 'minimum-onboarding: both preferences, no accounts/mileage, timezone, idempotency, MFA, tenant isolation passed' as result;
