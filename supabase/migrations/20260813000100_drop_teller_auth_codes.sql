-- Teller runtime has been retired.
-- Production inventory confirmed zero Teller authorization-code rows.
-- This table stores authorization material, not financial history.

do $$
declare
  has_rows boolean;
begin
  if to_regclass('public.teller_auth_codes') is not null then
    execute 'select exists (select 1 from public.teller_auth_codes limit 1)'
      into has_rows;

    if has_rows then
      raise exception
        'Refusing to drop public.teller_auth_codes because it contains rows';
    end if;
  end if;
end
$$;

drop table if exists public.teller_auth_codes;
