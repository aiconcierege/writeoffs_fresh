# Catch-up Workflow V2

Status: implementation in progress; not deployed or certified.

## Preservation

Read-only snapshots of both existing clean-room customers were captured before
implementation. `preservation-before.json` contains table counts and hashes, not
customer credentials or raw financial evidence. Full snapshots remain in protected
local temporary files. Customer #1's worker exclusion was verified enabled.
Customer #2 has no current Check-in action; this does not certify complete source
coverage. Its four uploaded documents and three usable receipt extractions remain.
The loan fact records $400 principal and $50 interest. Neither customer is a fixture.

## Coordinated implementation

1. Reuse the canonical ledger, source coverage, receipt intake, matching, worker
   dependencies, guided assertions and authoritative continuation. Add immutable
   journey events for statements, receipt collection completion and non-expense
   review. Events are business-owned, versioned, idempotent, MFA-protected and
   independent of financial classification.
2. Historical work follows statements → receipts and processing → bounded personal
   exceptions → bounded non-expense exceptions → material questions. Recent ongoing
   work retains priority. Purchased coverage never rolls into new charges.
   Rick confirmed on September 24 that covered months remain ongoing and
   exception-only even after leaving the rolling recent window. Historical bulk
   reviews use the fixed authorized cleanup interval, never the rolling window.
3. Existing correction commands remain the only authority for financial changes.
   An exception without an established economic nature stays unresolved; no generic
   "not expense" allocation or invented transfer is permitted.
4. Reuse merchant-scoped percentage fact history. Add only the missing, narrowly
   scoped customer-confirmed recurring-payment rule capability, including conflict
   invalidation, lineage and customer correction.
5. Integrate document handoff and receipt completion into the stable conversation.
   Add mobile capture/multiple selection and orientation handling while preserving
   original evidence bytes. Verify deployed decoder support before offering HEIF.
6. Count authoritative, answerable substantive questions only. Preserve the single
   visible transition, durable acknowledgment and stable requested-document turn.
7. Test local/domain/database/browser layers, then synthetic hosted staging. No
   public push is authorized. No partial workflow deployment or real-customer
   migration is part of this plan.

## Intentional supersessions

Rick's V2 instruction overrides historical specific-question-first precedence and
automatic receipt-opportunity completion immediately after upload. Current work
does not inherit repeated historical bulk reviews. A receipt upload is evidence,
not proof that the customer has supplied everything.

## Open pre-launch performance work

- Canonical purchase-purpose fallback: 3.77–4.70 seconds.
- Routine interaction p95 tails above preferred targets.
- Receipt reassessment: 46 seconds median / 71 seconds p95.
- Document processing, including about 59 seconds for the controlled loan.
- Substantial sequential shared evidence/category validation.

These remain separate from functional catch-up certification.
