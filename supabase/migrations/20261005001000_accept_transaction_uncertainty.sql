-- The activity-choice UI already offers not_sure. Accept it through the same
-- guarded canonical uncertainty path as use/purpose questions; never infer nature.
do $$
declare original text; updated text;
begin
 original := pg_get_functiondef('public.apply_bookkeeping_customer_question_fact(uuid,uuid,uuid,text,text,text,jsonb,bigint)'::regprocedure);
 updated := replace(original,
  '''BUSINESS_USE_UNCLEAR'', ''BUSINESS_PURPOSE_NEEDED'', ''MIXED_USE_CLARIFICATION''',
  '''BUSINESS_USE_UNCLEAR'', ''BUSINESS_PURPOSE_NEEDED'', ''MIXED_USE_CLARIFICATION'', ''TRANSACTION_TYPE_UNCLEAR''');
 if updated = original then raise exception 'Expected uncertainty reason guard missing'; end if;
 execute updated;
end;
$$;
