-- A material question may retain its context while account/receipt evidence or
-- its decision version changes. The old historical UNIQUE(context) prevented
-- the evidence-only refresh explicitly supported by open_review_issue_v2.
-- It also rejected a legitimate return to prior evidence after a correction.
--
-- Current-version idempotency remains enforced by the per-record/per-issue
-- advisory locks and equality checks in open_bookkeeping_review_issue_v2.
-- Unique predecessor constraints and sequence validation keep one append-only chain.
-- Answered/resolved/skipped events are still never refreshed by that function.
-- Keep the historical lookup index, without treating past context as the
-- unique identity of every future version of an unanswered question.
drop index public.bookkeeping_review_events_material_context_idx;
create index bookkeeping_review_events_material_context_idx
 on public.bookkeeping_review_events(review_issue_id,context_fingerprint)
 where event_type in ('opened','reopened');
