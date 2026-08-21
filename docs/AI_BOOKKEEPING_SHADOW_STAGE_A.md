# AI Bookkeeping Stage A

Stage A evaluates unresolved canonical bookkeeping records in write-disabled shadow mode.
It measures proposed bookkeeping judgments without changing decisions, allocations,
questions, tax treatments, documentation, reporting, or customer-visible state.

## Runtime order

The durable provider-neutral worker loads one tenant-scoped canonical snapshot and runs:

1. deterministic evaluator v1;
2. optional AI shadow evaluation only if deterministic evaluation abstains;
3. deterministic validation of the structured model output;
4. one operational/audit insert; and
5. normal job completion.

Structural transfer and credit-card-payment decisions therefore remain deterministic.
The AI gateway has no database write authority. Canonical bookkeeping services are not
called with an AI proposal in Stage A.

## Configuration

All three server-only values are required before AI is enabled:

- `BOOKKEEPING_AI_SHADOW_ENABLED=true`
- `BOOKKEEPING_AI_MODEL=<approved model identifier>`
- `OPENAI_API_KEY=<server-only project credential>`

`BOOKKEEPING_WORKER_SECRET` continues to protect the worker and inspection routes.
Missing or disabled AI configuration leaves ingestion and deterministic processing
fully operational. Never prefix these variables with `NEXT_PUBLIC_`.

The initial adapter uses OpenAI's Responses API with strict structured output and
`store: false`. Canonical orchestration depends only on `BookkeepingAiGateway`, so the
model identifier can change without changing bookkeeping rules. Stage A has no model
router or alternate-provider chain.

## Evidence boundary

The model receives only a versioned projection: signed integer cents, currency,
economic date/age, source kind/current state, merchant and description, account type,
plain-language Business description, presence (not contents) of linked documentation,
customer-answer count, current unresolved status, and symbolic evidence keys.

It does not receive user identity, account numbers, provider tokens, Supabase secrets,
raw provider payloads, full prompts from storage, receipt images, or other tenants'
activity. Historical-example retrieval and OCR content are intentionally deferred.

Merchant, description, Business text, and future OCR/customer text are serialized
inside an explicitly delimited untrusted-data object. They are never interpolated as
instructions. Runtime validation remains authoritative.

## Output and validation

The output union is `propose_decision`, `request_fact`, or `abstain`. A proposed
automatic use can only be `business`; Personal and mixed use are absent from the
schema. Stage A permits only shadow proposals for expense, business income, or refund.

Validation rejects malformed output, invented evidence keys, stale/current-leaf
changes, customer-authored current decisions, invalid source state, conflicting
evidence, unsupported business-use support, merchant-only support, and non-reconciling
integer-cent allocations. Question proposals are marked eligible only when ordinary
transaction activity is no more than 30 calendar days old. No question is created.

Provider schema and prompt version `v2` restrict every trusted code to the same
vocabulary as the runtime union and state the branch-specific null/invariant rules.
The supported provider schema cannot express every cross-field invariant, so runtime
validation remains final and deliberately does not coerce invalid output.

## Audit and idempotency

`bookkeeping_ai_shadow_evaluations` is service-role-only and append-only. It stores the
version/model identity, evidence fingerprint, structured proposal, evidence keys,
validation status/codes, question eligibility, safe timing/token metrics, and safe
provider-error code. It cannot store a write-enabled row.

Malformed structured output stores only field-level structural diagnostics (field,
failure category, and safe enum/code value where applicable). It does not retain the
rejected provider body, prompt, evidence text, hidden reasoning, or secrets.

A partial unique index permits only one non-provider-error result for an unchanged
Business, record, evidence fingerprint, evaluator/prompt/schema version, provider, and
model. Provider errors are append-only attempts and may be retried by the existing
queue. Abstention and validation rejection are successful evaluations and are not
retried.

## Development/staging operation

After applying the migration to the intended non-production project, start the app
with the four server-only variables above. Explicitly enqueue unresolved records for
the configured shadow identity:

```sh
curl -fsS -X POST http://localhost:3000/api/internal/bookkeeping/process \
  -H "Authorization: Bearer $BOOKKEEPING_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  --data '{"reconcile_ai_shadow":true,"batch_size":10}'
```

Repeat without reconciliation until `claimed` is zero. Each drain permits at most ten
AI-eligible jobs. Inspect sanitized results:

```sh
curl -fsS "http://localhost:3000/api/internal/bookkeeping/shadow?limit=100" \
  -H "Authorization: Bearer $BOOKKEEPING_WORKER_SECRET"
```

The inspection response includes merchant, amount, shadow outcome/proposal, evidence
keys, validation result, question eligibility, and safe usage/error metadata. It does
not expose prompts, credentials, raw provider payloads, or canonical implementation
authority.

Before and after shadow processing, compare current bookkeeping decisions,
allocations, review events, tax treatments, and Home/report totals. They must be
identical. Only the shadow audit table and operational queue may change.
