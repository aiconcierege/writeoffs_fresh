-- Preserve the original reviewed rule and append the controlling 2026 successor.
alter table public.contractor_awareness_rule_versions
  add column supersedes_rule_id uuid references public.contractor_awareness_rule_versions(id);

create unique index contractor_awareness_rule_successor_idx
  on public.contractor_awareness_rule_versions(supersedes_rule_id)
  where supersedes_rule_id is not null;

insert into public.contractor_awareness_rule_versions(
  tax_year, rule_key, rule_version, attention_amount_cents, status, supersedes_rule_id
)
select 2026, 'contractor_information_reporting_attention', 'contractor-awareness:2026:v2', 200000, 'active', id
from public.contractor_awareness_rule_versions
where tax_year = 2026
  and rule_key = 'contractor_information_reporting_attention'
  and rule_version = 'contractor-awareness:v1';

create view public.current_contractor_awareness_rules with (security_invoker = true) as
select rules.*
from public.contractor_awareness_rule_versions rules
where not exists (
  select 1 from public.contractor_awareness_rule_versions successor
  where successor.supersedes_rule_id = rules.id
);

grant select on public.current_contractor_awareness_rules to authenticated, service_role;
