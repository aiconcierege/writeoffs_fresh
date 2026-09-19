-- Run in BEGIN/ROLLBACK with two explicitly synthetic test business IDs.
do $test$
declare active_id uuid:=current_setting('test.business_id')::uuid;
 dormant_id uuid:=current_setting('test.other_business_id')::uuid;
 claimed uuid; lease uuid:=gen_random_uuid();
begin
 if active_id=dormant_id or (select count(*) from public.businesses b join auth.users u on u.id=b.owner_user_id
  where b.id in(active_id,dormant_id) and u.raw_user_meta_data->>'synthetic_guided_contract'='true')<>2
 then raise exception 'Only distinct synthetic fixtures allowed';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 -- Both are due before real work; only derived rows of these fixtures change.
 update public.betti_action_index_state set available_at='-infinity',lease_id=null,lease_expires_at=null,
  revision=revision+1,built_at=case when business_id=active_id then now() else null end
  where business_id in(active_id,dormant_id);
 select business_id into claimed from public.claim_betti_action_index_refresh(lease);
 if claimed is distinct from active_id then raise exception 'Dormant bootstrap displaced active recovery';end if;
 select business_id into claimed from public.claim_betti_action_index_refresh(gen_random_uuid(),active_id);
 if claimed is not null then raise exception 'Active lease was claimed twice';end if;
 select business_id into claimed from public.claim_betti_action_index_refresh(gen_random_uuid(),dormant_id);
 if claimed is distinct from dormant_id then raise exception 'Explicit bootstrap was blocked';end if;
end;$test$;
select 'PASS: active recovery priority, lease fencing, explicit bootstrap' as result;
