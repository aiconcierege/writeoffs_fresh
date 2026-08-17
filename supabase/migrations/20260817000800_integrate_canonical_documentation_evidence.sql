-- Couple canonical receipt links to documentation-risk history without changing
-- bookkeeping decisions or Weekly Review state.

alter table public.bookkeeping_document_links
  add constraint bookkeeping_document_links_event_scope_unique
  unique (id, business_id, bookkeeping_record_id);

alter table public.bookkeeping_documentation_events
  add column bookkeeping_document_link_id uuid,
  add column evidence_satisfies_request boolean,
  add constraint bookkeeping_documentation_events_link_fkey
    foreign key (
      bookkeeping_document_link_id, business_id, bookkeeping_record_id
    ) references public.bookkeeping_document_links (
      id, business_id, bookkeeping_record_id
    ) on delete restrict,
  add constraint bookkeeping_documentation_events_evidence_shape_check check (
    (event_type = 'evidence_attached'
      and bookkeeping_document_link_id is not null
      and evidence_satisfies_request is not null)
    or (event_type <> 'evidence_attached'
      and bookkeeping_document_link_id is null
      and evidence_satisfies_request is null)
  );

create unique index bookkeeping_documentation_events_link_observation_idx
  on public.bookkeeping_documentation_events (
    documentation_issue_id, bookkeeping_document_link_id
  ) where event_type = 'evidence_attached';

create or replace function public.documentation_request_accepts_receipt(
  p_question_context jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_question_context -> 'requirement' =
      '{"type":"receipt_for_record","version":1}'::jsonb,
    false
  );
$$;

revoke execute on function public.documentation_request_accepts_receipt(jsonb)
  from public, anon, authenticated;
grant execute on function public.documentation_request_accepts_receipt(jsonb)
  to service_role;

create or replace function public.validate_bookkeeping_documentation_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  predecessor public.bookkeeping_documentation_events%rowtype;
begin
  if new.actor_user_id is not null and not exists (
    select 1 from public.businesses
    where id = new.business_id and owner_user_id = new.actor_user_id
  ) then raise exception 'documentation event actor does not own Business'; end if;

  if new.supersedes_event_id is null then
    if new.event_type <> 'request_opened' or new.sequence_number <> 1
      or new.documentation_issue_id <> new.id
      or new.provenance not in ('automation', 'system')
      or new.assertion_payload is not null
      or new.question_context is null
      or new.bookkeeping_document_link_id is not null
      or new.evidence_satisfies_request is not null
    then raise exception 'documentation issue must begin with one trusted request'; end if;
    return new;
  end if;

  select * into predecessor
  from public.bookkeeping_documentation_events
  where id = new.supersedes_event_id
    and business_id = new.business_id
    and bookkeeping_record_id = new.bookkeeping_record_id
    and documentation_issue_id = new.documentation_issue_id
  for update;
  if not found then raise exception 'documentation predecessor is unavailable'; end if;
  if exists (
    select 1 from public.bookkeeping_documentation_events
    where supersedes_event_id = predecessor.id
  ) then raise exception 'documentation history must supersede its current leaf'; end if;
  if new.sequence_number <> predecessor.sequence_number + 1
    or new.reason <> predecessor.reason or new.issue_key <> predecessor.issue_key
  then raise exception 'documentation issue identity and ordering are immutable'; end if;

  if new.event_type = 'receipt_lost' then
    if predecessor.event_type not in ('request_opened', 'reopened', 'evidence_attached')
      or (predecessor.event_type = 'evidence_attached'
        and predecessor.evidence_satisfies_request)
      or new.provenance <> 'user' or new.actor_user_id is null
      or new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint <> predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
      or new.assertion_payload <> '{"schemaVersion":1,"assertion":"receipt_lost"}'::jsonb
    then raise exception 'Receipt Lost must be one exact user assertion on the outstanding request'; end if;
  elsif new.event_type = 'evidence_attached' then
    if predecessor.event_type not in (
        'request_opened', 'reopened', 'resolved', 'evidence_attached'
      )
      or (predecessor.event_type = 'evidence_attached'
        and predecessor.evidence_satisfies_request)
      or new.provenance not in ('automation', 'system', 'user')
      or new.question_context is distinct from predecessor.question_context
      or new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint = predecessor.evidence_fingerprint
      or new.assertion_payload <> jsonb_build_object(
        'schemaVersion', 1,
        'observation', 'document_linked',
        'satisfiesRequirement', new.evidence_satisfies_request
      )
      or not exists (
        select 1 from public.bookkeeping_document_links links
        where links.id = new.bookkeeping_document_link_id
          and links.business_id = new.business_id
          and links.bookkeeping_record_id = new.bookkeeping_record_id
          and links.revoked_at is null
      )
    then raise exception 'documentation evidence observation is invalid'; end if;
  elsif new.event_type = 'resolved' then
    if predecessor.event_type not in ('receipt_lost', 'evidence_attached')
      or (predecessor.event_type = 'evidence_attached'
        and not predecessor.evidence_satisfies_request)
      or new.provenance <> 'system' or new.assertion_payload is not null
      or new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint <> predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
    then raise exception 'documentation resolution must preserve its supported context'; end if;
  elsif new.event_type = 'reopened' then
    if predecessor.event_type not in ('resolved', 'evidence_attached')
      or (predecessor.event_type = 'evidence_attached'
        and predecessor.evidence_satisfies_request)
      or new.provenance not in ('automation', 'system')
      or new.assertion_payload is not null or new.question_context is null
      or new.context_fingerprint = predecessor.context_fingerprint
      or new.evidence_fingerprint = predecessor.evidence_fingerprint
    then raise exception 'reopen requires materially new context and evidence'; end if;
  else
    raise exception 'unsupported documentation lifecycle transition';
  end if;
  return new;
end;
$$;

create or replace function public.open_bookkeeping_documentation_request(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_reason text,
  p_issue_key text,
  p_context_fingerprint text,
  p_question_context jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_id uuid := gen_random_uuid();
  selected_event public.bookkeeping_documentation_events%rowtype;
  evidence_fingerprint text;
begin
  if (select auth.role()) <> 'service_role'
  then raise exception 'trusted documentation request opening required'; end if;
  if p_reason <> 'MISSING_SUPPORTING_DOCUMENTATION'
    or length(btrim(p_issue_key)) not between 1 and 200
    or length(btrim(p_context_fingerprint)) not between 1 and 200
    or jsonb_typeof(p_question_context) <> 'object'
    or p_question_context -> 'schemaVersion' <> '1'::jsonb
    or p_question_context ->> 'reason' <> p_reason
    or (p_question_context ? 'requirement' and
      not public.documentation_request_accepts_receipt(p_question_context))
  then raise exception 'supported documentation request context is required'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_bookkeeping_record_id::text, 41)
  );
  if not exists (
    select 1 from public.bookkeeping_records
    where id = p_bookkeeping_record_id and business_id = p_business_id
  ) then raise exception 'bookkeeping record is unavailable'; end if;
  evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    p_business_id, p_bookkeeping_record_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || ':' || p_bookkeeping_record_id::text || ':' ||
    p_reason || ':' || btrim(p_issue_key), 73
  ));

  select leaf.* into selected_event
  from public.bookkeeping_documentation_events root
  join lateral (
    select events.* from public.bookkeeping_documentation_events events
    where events.documentation_issue_id = root.documentation_issue_id
      and not exists (
        select 1 from public.bookkeeping_documentation_events successors
        where successors.supersedes_event_id = events.id
      )
  ) leaf on true
  where root.business_id = p_business_id
    and root.bookkeeping_record_id = p_bookkeeping_record_id
    and root.reason = p_reason and root.issue_key = btrim(p_issue_key)
    and root.event_type = 'request_opened';

  if selected_event.id is not null then
    if selected_event.event_type = 'resolved' and exists (
      select 1 from public.bookkeeping_documentation_events history
      where history.documentation_issue_id = selected_event.documentation_issue_id
        and history.event_type = 'receipt_lost'
    ) then return selected_event.id; end if;
    if selected_event.context_fingerprint <> btrim(p_context_fingerprint)
      or selected_event.evidence_fingerprint <> evidence_fingerprint
      or selected_event.question_context is distinct from p_question_context
    then raise exception 'documentation context changed; trusted reevaluation required'; end if;
    return selected_event.id;
  end if;

  if exists (
    select 1 from public.bookkeeping_document_links
    where business_id = p_business_id
      and bookkeeping_record_id = p_bookkeeping_record_id
      and revoked_at is null
  ) then raise exception 'supporting documentation is already attached'; end if;

  insert into public.bookkeeping_documentation_events (
    id, business_id, bookkeeping_record_id, documentation_issue_id,
    sequence_number, event_type, reason, issue_key, context_fingerprint,
    evidence_fingerprint, question_context, provenance
  ) values (
    issue_id, p_business_id, p_bookkeeping_record_id, issue_id,
    1, 'request_opened', p_reason, btrim(p_issue_key),
    btrim(p_context_fingerprint), evidence_fingerprint,
    p_question_context, 'automation'
  ) returning id into issue_id;
  return issue_id;
end;
$$;

create or replace function public.mark_bookkeeping_receipt_lost(
  p_documentation_issue_id uuid,
  p_expected_current_event_id uuid,
  p_expected_context_fingerprint text,
  p_expected_evidence_fingerprint text,
  p_assertion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_documentation_events%rowtype;
  receipt_lost_id uuid;
  resolved_id uuid;
  current_evidence_fingerprint text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_assertion) <> 'object'
    or (select count(*) from jsonb_object_keys(p_assertion)) <> 2
    or p_assertion <> '{"schemaVersion":1,"assertion":"receipt_lost"}'::jsonb
  then raise exception 'only the exact Receipt Lost assertion is accepted'; end if;

  select * into current_event from public.bookkeeping_documentation_events
  where documentation_issue_id = p_documentation_issue_id
    and id = p_expected_current_event_id;
  if not found or not exists (
    select 1 from public.businesses
    where id = current_event.business_id and owner_user_id = (select auth.uid())
  ) then raise exception 'documentation request is unavailable to authenticated user'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_event.bookkeeping_record_id::text, 41)
  );
  select * into current_event from public.bookkeeping_documentation_events
  where documentation_issue_id = p_documentation_issue_id
    and id = p_expected_current_event_id for update;
  if not found
    or current_event.event_type not in ('request_opened', 'reopened', 'evidence_attached')
    or (current_event.event_type = 'evidence_attached'
      and current_event.evidence_satisfies_request)
    or exists (
      select 1 from public.bookkeeping_documentation_events
      where supersedes_event_id = current_event.id
    )
  then raise exception 'current documentation event changed'; end if;
  if current_event.reason <> 'MISSING_SUPPORTING_DOCUMENTATION'
    or current_event.context_fingerprint <> p_expected_context_fingerprint
    or current_event.evidence_fingerprint <> p_expected_evidence_fingerprint
    or current_event.question_context -> 'schemaVersion' <> '1'::jsonb
    or current_event.question_context ->> 'reason' <> current_event.reason
  then raise exception 'trusted documentation request context changed'; end if;
  current_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    current_event.business_id, current_event.bookkeeping_record_id
  );
  if current_evidence_fingerprint <> current_event.evidence_fingerprint
  then raise exception 'canonical evidence changed; documentation request requires reevaluation'; end if;

  insert into public.bookkeeping_documentation_events (
    business_id, bookkeeping_record_id, documentation_issue_id,
    supersedes_event_id, sequence_number, event_type, reason, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    assertion_payload, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.documentation_issue_id, current_event.id,
    current_event.sequence_number + 1, 'receipt_lost', current_event.reason,
    current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    p_assertion, 'user', (select auth.uid())
  ) returning id into receipt_lost_id;

  insert into public.bookkeeping_documentation_events (
    business_id, bookkeeping_record_id, documentation_issue_id,
    supersedes_event_id, sequence_number, event_type, reason, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.documentation_issue_id, receipt_lost_id,
    current_event.sequence_number + 2, 'resolved', current_event.reason,
    current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    'system', null
  ) returning id into resolved_id;

  return jsonb_build_object(
    'business_id', current_event.business_id,
    'receipt_lost_event_id', receipt_lost_id,
    'resolved_event_id', resolved_id
  );
end;
$$;

create or replace function public.attach_bookkeeping_receipt_with_documentation(
  p_bookkeeping_record_id uuid,
  p_receipt_id uuid
)
returns public.bookkeeping_document_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_business_id uuid;
  selected_link public.bookkeeping_document_links%rowtype;
  current_event public.bookkeeping_documentation_events%rowtype;
  evidence_event_id uuid;
  post_link_fingerprint text;
  satisfies boolean;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select records.business_id into selected_business_id
  from public.bookkeeping_records records
  join public.businesses businesses on businesses.id = records.business_id
  where records.id = p_bookkeeping_record_id
    and businesses.owner_user_id = (select auth.uid());
  if not found or not exists (
    select 1 from public.receipts
    where id = p_receipt_id and user_id = (select auth.uid())
  ) then raise exception 'receipt or bookkeeping record is unavailable'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_bookkeeping_record_id::text, 41)
  );
  insert into public.bookkeeping_document_links (
    business_id, bookkeeping_record_id, receipt_id, provenance, actor_user_id
  ) values (
    selected_business_id, p_bookkeeping_record_id, p_receipt_id,
    'user', (select auth.uid())
  ) on conflict (bookkeeping_record_id, receipt_id)
    where revoked_at is null do nothing
  returning * into selected_link;
  if selected_link.id is null then
    select * into selected_link from public.bookkeeping_document_links
    where business_id = selected_business_id
      and bookkeeping_record_id = p_bookkeeping_record_id
      and receipt_id = p_receipt_id and revoked_at is null;
  end if;
  if selected_link.id is null then raise exception 'document link is unavailable'; end if;

  post_link_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    selected_business_id, p_bookkeeping_record_id
  );

  for current_event in
    select leaf.*
    from public.bookkeeping_documentation_events roots
    join lateral (
      select events.* from public.bookkeeping_documentation_events events
      where events.documentation_issue_id = roots.documentation_issue_id
        and not exists (
          select 1 from public.bookkeeping_documentation_events successors
          where successors.supersedes_event_id = events.id
        )
    ) leaf on true
    where roots.business_id = selected_business_id
      and roots.bookkeeping_record_id = p_bookkeeping_record_id
      and roots.event_type = 'request_opened'
    order by roots.documentation_issue_id
  loop
    if exists (
      select 1 from public.bookkeeping_documentation_events observations
      where observations.documentation_issue_id = current_event.documentation_issue_id
        and observations.bookkeeping_document_link_id = selected_link.id
        and observations.event_type = 'evidence_attached'
    ) then continue; end if;

    satisfies := public.documentation_request_accepts_receipt(
      current_event.question_context
    );
    if current_event.event_type = 'resolved' and not satisfies then
      continue;
    end if;

    insert into public.bookkeeping_documentation_events (
      business_id, bookkeeping_record_id, documentation_issue_id,
      supersedes_event_id, sequence_number, event_type, reason, issue_key,
      context_fingerprint, evidence_fingerprint, question_context,
      assertion_payload, provenance, actor_user_id,
      bookkeeping_document_link_id, evidence_satisfies_request
    ) values (
      current_event.business_id, current_event.bookkeeping_record_id,
      current_event.documentation_issue_id, current_event.id,
      current_event.sequence_number + 1, 'evidence_attached',
      current_event.reason, current_event.issue_key,
      current_event.context_fingerprint, post_link_fingerprint,
      current_event.question_context,
      jsonb_build_object('schemaVersion', 1, 'observation', 'document_linked',
        'satisfiesRequirement', satisfies),
      'user', (select auth.uid()), selected_link.id, satisfies
    ) returning id into evidence_event_id;

    if satisfies then
      insert into public.bookkeeping_documentation_events (
        business_id, bookkeeping_record_id, documentation_issue_id,
        supersedes_event_id, sequence_number, event_type, reason, issue_key,
        context_fingerprint, evidence_fingerprint, question_context, provenance
      ) values (
        current_event.business_id, current_event.bookkeeping_record_id,
        current_event.documentation_issue_id, evidence_event_id,
        current_event.sequence_number + 2, 'resolved', current_event.reason,
        current_event.issue_key, current_event.context_fingerprint,
        post_link_fingerprint, current_event.question_context, 'system'
      );
    end if;
  end loop;
  return selected_link;
end;
$$;

create or replace function public.revoke_bookkeeping_receipt_with_documentation(
  p_document_link_id uuid,
  p_reason text
)
returns public.bookkeeping_document_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_link public.bookkeeping_document_links%rowtype;
  current_event public.bookkeeping_documentation_events%rowtype;
  post_revoke_fingerprint text;
  next_context jsonb;
  next_context_fingerprint text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if length(btrim(p_reason)) not between 1 and 1000
  then raise exception 'revocation reason is required'; end if;
  select links.* into selected_link
  from public.bookkeeping_document_links links
  join public.businesses businesses on businesses.id = links.business_id
  where links.id = p_document_link_id
    and businesses.owner_user_id = (select auth.uid());
  if not found then raise exception 'document link is unavailable'; end if;
  if selected_link.revoked_at is not null then return selected_link; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(selected_link.bookkeeping_record_id::text, 41)
  );
  select links.* into selected_link
  from public.bookkeeping_document_links links
  join public.businesses businesses on businesses.id = links.business_id
  where links.id = p_document_link_id
    and businesses.owner_user_id = (select auth.uid())
  for update of links;
  if selected_link.revoked_at is not null then return selected_link; end if;

  update public.bookkeeping_document_links set
    revoked_at = now(),
    revoked_by_user_id = (select auth.uid()),
    revocation_reason = btrim(p_reason)
  where id = selected_link.id returning * into selected_link;

  post_revoke_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    selected_link.business_id, selected_link.bookkeeping_record_id
  );

  for current_event in
    select leaf.*
    from public.bookkeeping_documentation_events roots
    join lateral (
      select events.* from public.bookkeeping_documentation_events events
      where events.documentation_issue_id = roots.documentation_issue_id
        and not exists (
          select 1 from public.bookkeeping_documentation_events successors
          where successors.supersedes_event_id = events.id
        )
    ) leaf on true
    where roots.business_id = selected_link.business_id
      and roots.bookkeeping_record_id = selected_link.bookkeeping_record_id
      and roots.event_type = 'request_opened'
    order by roots.documentation_issue_id
  loop
    if exists (
      select 1 from public.bookkeeping_documentation_events history
      where history.documentation_issue_id = current_event.documentation_issue_id
        and history.event_type = 'receipt_lost'
    ) then continue; end if;
    if not public.documentation_request_accepts_receipt(
      current_event.question_context
    ) then
      if current_event.event_type = 'evidence_attached'
        and not current_event.evidence_satisfies_request
        and current_event.bookkeeping_document_link_id = selected_link.id
      then null; else continue; end if;
    elsif exists (
      select 1 from public.bookkeeping_document_links links
      where links.business_id = selected_link.business_id
        and links.bookkeeping_record_id = selected_link.bookkeeping_record_id
        and links.revoked_at is null
    ) then continue;
    elsif current_event.event_type not in ('resolved', 'evidence_attached') then
      continue;
    end if;

    next_context := jsonb_set(
      current_event.question_context,
      '{lastEvidenceChange}',
      jsonb_build_object(
        'type', 'document_link_revoked',
        'documentLinkId', selected_link.id,
        'version', 1
      ), true
    );
    next_context_fingerprint := md5(concat_ws('|',
      current_event.context_fingerprint,
      selected_link.id::text,
      post_revoke_fingerprint,
      'document_link_revoked:v1'
    ));
    insert into public.bookkeeping_documentation_events (
      business_id, bookkeeping_record_id, documentation_issue_id,
      supersedes_event_id, sequence_number, event_type, reason, issue_key,
      context_fingerprint, evidence_fingerprint, question_context, provenance
    ) values (
      current_event.business_id, current_event.bookkeeping_record_id,
      current_event.documentation_issue_id, current_event.id,
      current_event.sequence_number + 1, 'reopened', current_event.reason,
      current_event.issue_key, next_context_fingerprint,
      post_revoke_fingerprint, next_context, 'system'
    );
  end loop;
  return selected_link;
end;
$$;

create or replace function public.list_current_bookkeeping_documentation_requests(
  p_business_id uuid
)
returns setof public.bookkeeping_documentation_events
language sql
stable
set search_path = ''
as $$
  select events.*
  from public.bookkeeping_documentation_events events
  where events.business_id = p_business_id
    and (
      events.event_type in ('request_opened', 'reopened')
      or (events.event_type = 'evidence_attached'
        and not events.evidence_satisfies_request)
    )
    and not exists (
      select 1 from public.bookkeeping_documentation_events successors
      where successors.supersedes_event_id = events.id
    )
  order by events.created_at, events.id;
$$;

revoke insert, update on public.bookkeeping_document_links from authenticated;
revoke execute on function public.ensure_bookkeeping_document_link(
  uuid, uuid, uuid, text
) from authenticated;

revoke execute on function public.attach_bookkeeping_receipt_with_documentation(
  uuid, uuid
) from public, anon;
grant execute on function public.attach_bookkeeping_receipt_with_documentation(
  uuid, uuid
) to authenticated;
revoke execute on function public.revoke_bookkeeping_receipt_with_documentation(
  uuid, text
) from public, anon;
grant execute on function public.revoke_bookkeeping_receipt_with_documentation(
  uuid, text
) to authenticated;

comment on function public.attach_bookkeeping_receipt_with_documentation(uuid, uuid)
is 'Atomically creates or reuses owned receipt evidence and observes relevant documentation risk without changing bookkeeping.';
comment on function public.revoke_bookkeeping_receipt_with_documentation(uuid, text)
is 'Atomically revokes owned receipt evidence and reopens only documentation requests not already resolved by Receipt Lost.';
