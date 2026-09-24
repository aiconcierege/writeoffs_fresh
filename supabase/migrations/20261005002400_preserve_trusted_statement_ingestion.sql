-- The leased statement importer checks service authorization before temporarily
-- setting the individual owner/role context needed by canonical source creation.
-- Its signed request JWT remains service_role. Do not mistake that trusted worker
-- for a customer missing MFA. Customer calls still require owner + AAL2 + lifecycle.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.associate_later_bank_receipt(uuid,uuid)'::regprocedure);
 updated:=replace(original,
 'coalesce(auth.role(),'''')<>''service_role'' and public.require_customer_setup_owner()',
 'coalesce(auth.role(),'''')<>''service_role'' and coalesce(auth.jwt()->>''role'','''')<>''service_role'' and public.require_customer_setup_owner()');
 if updated=original then raise exception 'Expected later-bank authorization guard missing';end if;execute updated;
end; $$;
