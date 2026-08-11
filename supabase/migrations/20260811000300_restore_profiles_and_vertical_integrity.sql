-- Restore the one-profile-per-user invariant and keep the approved MVP
-- industry pack synchronized with the user's Business.

insert into public.profiles (id, vertical)
select users.id, 'general'
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

update public.profiles
set vertical = 'general'
where vertical is null
   or vertical not in ('general', 'realtor');

alter table public.profiles
  alter column vertical set default 'general',
  alter column vertical set not null;

alter table public.profiles
  add constraint profiles_vertical_check
  check (vertical in ('general', 'realtor'));

-- Profile is authoritative for the selected product pack.
update public.businesses as businesses
set industry = profiles.vertical
from public.profiles as profiles
where profiles.id = businesses.owner_user_id
  and businesses.industry is distinct from profiles.vertical;

create or replace function public.sync_profile_vertical_to_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.businesses
  set industry = new.vertical
  where owner_user_id = new.id
    and industry is distinct from new.vertical;

  return new;
end;
$$;

create trigger sync_profile_vertical_to_business
after insert or update of vertical on public.profiles
for each row execute function public.sync_profile_vertical_to_business();

-- Replace the existing signup trigger function without changing its trigger.
-- Every new auth user receives both required one-to-one records.
create or replace function public.create_business_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_vertical text := case
    when new.raw_user_meta_data ->> 'vertical' = 'realtor' then 'realtor'
    else 'general'
  end;
begin
  insert into public.profiles (id, vertical)
  values (new.id, selected_vertical)
  on conflict (id) do nothing;

  insert into public.businesses (
    owner_user_id,
    name,
    industry,
    owner_name,
    contact_email
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''),
    selected_vertical,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), ''),
    new.email
  )
  on conflict (owner_user_id) do nothing;

  return new;
end;
$$;
