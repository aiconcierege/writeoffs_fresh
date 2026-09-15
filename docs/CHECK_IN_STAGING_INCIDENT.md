# Check-in staging incident — September 15, 2026

## Confirmed customer-state diagnosis

Read-only inspection matched exactly one fresh First Platypus Bank Sandbox
connection with active Stripe membership, then limited inspection to the reported
Starbucks $4.33 purchases on May 11 and June 10, 2026. No identities were enumerated,
no customer answers were fabricated, and no customer questions were manually resolved.

The May answer reached the server, persisted once and resolved its original issue.
The meal parser extracted neither an attendee relationship nor a business purpose,
so the canonical writer correctly opened a follow-up. That answer also made the
current decision customer-authoritative. A subsequent worker assessment superseded
the original established assessment. The follow-up still referenced that historical
assessment, but the answer function searched only the current assessment view.
Consequently it rejected the current follow-up with `business context changed`.
The June question had no persisted answer at inspection time.

This was an assessment-history defect in business-context meal questions, not a
failure of all text inputs. Separately, multiline/repeated-space meal answers were
reproducibly rejected because parser normalization broke the database's verbatim
fact validation. Both defects are repaired.

## Starbucks evidence and questioning

Both records have Plaid categories `FOOD_AND_DRINK` / `FOOD_AND_DRINK_COFFEE` and
customer-designated Business-only account evidence. The provider category establishes
the type of purchase; the account designation supplies bookkeeping business context.
Automation therefore records a business expense with meal context and `needs_review`.
Neither record had meal-attendee facts, a stated meal business purpose, or a final
canonical tax treatment at inspection. Starbucks alone was not used to establish
a deductible business meal. The basic business-use question is skipped because
account-use facts already supply that context; attendee and business-purpose facts
are still required. The repair does not weaken those requirements or manufacture
facts from an answer the parser cannot understand.

## Repair

- The canonical meal answer function reads the immutable established assessment
  attached to the current question. Existing owner, event-version, current-decision,
  evidence-fingerprint, transaction-lock and verbatim-answer checks are unchanged.
- Meal extraction preserves internal whitespace instead of rewriting customer text.
- Check-in locks submission synchronously, retains acknowledged versions even if
  the next queue read fails, and requires an authoritative reload after uncertain
  transport outcomes. Inputs reset when the current question/version changes.
- Surviving questions keep session order; newly discovered work is appended.
  Completed immutable versions cannot reappear from a stale read, while genuinely
  new versions/follow-ups remain available.
- The queue response is explicitly `no-store`. Progress shows the current question
  number and the number waiting now, rather than implying a fixed denominator.
  The previous denominator was answers-this-session plus the live queue length;
  background discovery and legitimate follow-ups could increase it.

## Staging certification

Only dedicated staging project `writeoffs-fresh-staging` and Supabase project
`sgrqrrxrlglhjuetdtps` were changed. Migration `20260915000100` is applied and recorded.

Canonical write tests reproduced the assessment failure before the migration and
passed afterward, including multiline and repeated-space answers. Each successful
answer produced one answer event and one resolution event. Browser certification
used an isolated synthetic customer with real MFA and the real staging endpoints:
three consecutive multiline answers, synchronous double clicks, a deliberately
failed next-queue request and recovery, refresh, leaving/returning, and replay of
old versions. Three submissions resolved three questions. Replays returned 409 and
resolved questions stayed absent. Session reconciliation tests cover newly arriving
and reordered questions. This does not claim Rick's actual account was answered
by the agent; Rick retains control of the live test.

Approved future Home/Check-in visual findings are recorded separately in
`FRESH_CUSTOMER_UX_FINDINGS.md`; the broader redesign is not implemented.
