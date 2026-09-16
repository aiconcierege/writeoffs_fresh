# Durable Document Processing

Status: receipt pipeline updated September 16, 2026; statement sections retain their original milestone scope. See WORKFLOW_SPECIFICATION.md for current product authority.

## Boundary

Document processing is operational evidence handling, not a second accounting ledger. A stored file may produce an immutable canonical receipt extraction or a statement-import proposal, but matching, reconciliation, bookkeeping decisions, and tax treatment remain separate authoritative systems.

The lifecycle is:

`select files → hash → private storage → Business registration → durable job → inspect → extract if needed → normalize → canonical finalizer/reconciliation → terminal state`

The browser is responsible only for hashing, private storage upload, and authenticated registration. Once registration succeeds, the customer may close the page. Database registration transactionally creates one versioned job per exact Business/file/processor identity.

## Receipt intake

The receipt input accepts multiple JPEG, PNG, WebP, or PDF files. It uploads four files concurrently and reports accepted, duplicate, and failed counts. There is no low batch limit or monthly quota; a customer may select hundreds of files. Each file is independently hashed, stored, registered, queued, retried, and displayed. An individual upload failure does not roll back successful files and can be retried.

Receipt files are limited to 20 MiB each. This is a transport/provider safety bound, not a monthly usage quota. Exact duplicate bytes within one Business resolve to the existing receipt. The second upload does not create another receipt, canonical economic record, extraction job, or provider call.

The canonical receipt job checks for a completed `vision:v1` extraction before invoking OCR. Existing extraction results are immutable and reused by rematching, convergence, answers, and reporting. Those later operations never resend the file to OCR or a model.

Images receive magic-byte/MIME validation, then bounded Google Vision text detection with a 20-second timeout. The normalized parser accepts only labeled total/amount-due decimal amounts; it does not select arbitrary large numbers or payment IDs. The existing deterministic `receipt-quality:v1` and autonomous finalizer remain authoritative.

PDF receipt sources are retained. The ordinary expensive-vision policy remains at most 10 pages. The current canonical worker records a safe incomplete extraction and terminal attention reason when native PDF facts are not available; it never silently truncates pages into trusted economics. Multimodal receipt understanding remains write-disabled shadow work.

## Receipt repair and recovery — September 2026

Staging's expense-processing pause flag had left three uploads pending with zero attempts, even though cron was running. Resume the flag only on the dedicated staging deployment with the repaired pipeline; never infer that a successful upload means extraction has run.

Canonical extraction remains Google Vision `DOCUMENT_TEXT_DETECTION`, not an AI bookkeeping decision. Word geometry reconnects separated label/value columns. Dates support unambiguous US numeric and named-month forms; labeled totals preserve exact cents. Multiple purchase dates plus multiple totals stop processing with `MULTIPLE_RECEIPTS_DETECTED`. Conflicting totals or dates also require help. V1 does not split images: ask the customer to upload each receipt separately. This is conservative OCR-based detection, not a guarantee of detecting every composite image; ambiguous evidence never supplies invented facts.

A new receipt may attach to an already classified financial transaction without changing its decision or allocation. Candidates require the same Business, a current posted source, USD, an exact inverse-signed amount, equal normalized merchants, and a date within three days. A one-to-one candidate relationship is required; conflicting amounts and ambiguous candidates never auto-match. Existing record-convergence rules remain separate and unchanged. Matching records receipt/documentation history and requests canonical evidence reevaluation; it does not blanket-answer questions.

`Receipt only` contains processed unmatched evidence, not uploads awaiting extraction. Processing/help states remain visible in Receipts. The page refreshes processing status; guided upload opens the chooser directly in Transactions and retains review context. Home upload feedback spans the receipt card's width.

Provider HTTP/response errors and 20-second timeouts retry under existing six-attempt/backoff rules. Exhausted jobs and expired final leases become visible failure states. Customers can request another processing attempt for an owned failed receipt through the authenticated retry route; only the trusted worker can change operational job state. Multi-receipt help asks for separate uploads rather than retrying the same ambiguous image. Paused or unusually delayed work is labeled truthfully instead of appearing to make progress indefinitely. Originals and extraction history are retained.

### Staging validation evidence

The September 16 repair was exercised through real PNG uploads and Google Vision on isolated synthetic tenants. Cases: exact merchant/date/$12 receipt versus -$12 bank transaction (automatic match); $9.54 wrong amount (unmatched); no bank candidate (receipt only); two receipts in one image (help, no combined extraction); two bank candidates (no automatic match); two-day posting difference (automatic match). Each canonical job reached a terminal state on its first attempt. Tests verified one evidence link/history match, registration retry idempotency, preserved customer classification, no duplicate expense, work-view updates, and cross-tenant read/retry/attachment rejection. Responsive coverage is 390, 430, and 1280 pixels.

The original manual uploads were not edited or replayed by an operator. The scheduled worker naturally processed them after the staging pause was lifted: exact amount matched, wrong amount retained unmatched, composite image stopped with conflicting-total help. Originals remain stored. OCR punctuation spacing discovered during certification has regression coverage. Home's match summary now excludes unmatched receipt-origin records.

Full automated validation passes; database integration tests requiring a local Supabase instance are skipped when that instance is absent. Staging browser checks supplement, rather than replace, those tests. PDF extraction and universal multi-receipt detection are not claimed by this repair.

## Statement intake

Bank and card statements are Business-owned documents, not receipts and not bookkeeping records. The Import route accepts multiple PDFs, hashes and uploads three concurrently, and registers each independently. Exact Business/file duplicates collapse before processing.

Statement PDFs may be up to 100 MiB and 500 pages. These high protective bounds accommodate multi-month and combined statements while preventing unbounded memory/provider work. They are deliberately separate from the 10-page receipt vision bound. The worker validates PDF structure, counts pages, and records 25-page chunk boundaries so a future native text/table adapter can process logical sections independently.

This milestone does **not** create financial transactions from statement PDFs. Native text/table extraction and overlap-safe canonical ingestion remain a bounded follow-up. Until that adapter is approved, a valid statement reaches `Needs your help` with `STATEMENT_EXTRACTION_ADAPTER_PENDING`; it is never represented as organized financial activity. Customers can still use canonical CSV import. This fail-closed state is preferable to silently inventing statement rows.

## Queue and worker

The existing `receipt_processing_jobs` queue is extended with either a `receipt_id` or `document_id`, never both. Typed jobs are:

- `canonical_receipt_extraction`
- `statement_inspection`
- `receipt_understanding_shadow`

Typed `FOR UPDATE SKIP LOCKED` claims prevent one processor from consuming another job type. Claims have leases; expired leases recover automatically. Each scheduled drain claims at most four canonical document jobs, twelve bookkeeping jobs, and one optional receipt-understanding shadow job, with a 300-second invocation budget. Authenticated receipt registration additionally wakes its own durable job after responding, with a 60-second invocation budget. Typed/scoped claims keep overlapping upload and scheduled workers idempotent. Receipt canonical concurrency is bounded by the server invocation and queue claim, not customer upload count.

`/api/internal/processing/drain` requires a timing-safe Bearer comparison against `CRON_SECRET` or `BOOKKEEPING_WORKER_SECRET`. It is safe to invoke repeatedly and returns bounded counts plus queue health. `vercel.json` declares a once-per-minute schedule for deployment configuration. Production must configure Vercel's `CRON_SECRET` and verify invocations before enabling customer uploads. No remote schedule was configured by this milestone.

## Retries and terminal states

Operational states are `pending`, `processing`, `retryable`, `completed`, `needs_attention`, `unreadable`, and `dead_letter`.

- Network/provider timeouts, unavailable storage, and transient writes retry with exponential backoff.
- MIME/content mismatch, unreadable PDFs, and documents with no readable text stop as `unreadable`.
- Safe but incomplete extraction, the ordinary-document page bound, and statement-adapter absence stop as `needs_attention`.
- Six unsuccessful claims produce `dead_letter`; jobs do not remain Processing forever.
- Completed, attention, and unreadable outcomes have a completion timestamp and bounded terminal reason.

Operators inspect the service-only `document_processing_observability` view or the authenticated drain response for counts by job type/state, oldest queued age, maximum attempts, last safe error category, and stuck-processing indication. Logs and responses never include file bytes, full document text, signed URLs, access credentials, or provider keys.

Recovery procedure:

1. inspect the queue category, age, attempt count, and bounded error code;
2. correct provider/configuration/storage availability without changing canonical facts;
3. invoke `requeue_terminal_document_processing_job` with the exact job ID, expected terminal state, and bounded operator reason; stale state fails safely and recovery count is preserved;
4. never alter the document hash, Business, processor version, or receipt extraction to force success;
5. if content is genuinely unreadable, leave the terminal state and request only the missing factual help.

An HTTP operator retry endpoint is intentionally deferred until an authenticated operations role exists. The service-role-only guarded RPC is the recovery primitive; direct customer mutation of queue/audit rows is denied.

## Cost controls

The processing order is deterministic inspection first, native PDF inspection second, structured/table extraction when an approved adapter exists, OCR only for supported images/pages that need it, and multimodal vision only when cheaper evidence is insufficient. Current multimodal understanding remains shadow-only and configuration-disabled by default.

Existing controls include:

- Business-scoped SHA-256 deduplication;
- immutable extraction identities and cached successful results;
- per-file byte bounds;
- distinct receipt/statement page policies;
- bounded claim sizes and leases;
- six-attempt retry cap with exponential backoff;
- provider timeout;
- typed queues and provider/version identities;
- 10-page ordinary multimodal maximum;
- 500-page/100 MiB statement protective maximum;
- append-only bounded result metadata and no duplicate image storage in audit rows.

Business processing budgets, distributed edge rate limits, provider-spend alerts, and anomaly signals should slow suspicious automation rather than reject normal bookkeeping catch-up. `DOCUMENT_EXPENSIVE_PROCESSING_ENABLED=false` is the launch emergency circuit breaker: intake remains durable and queued while the worker pauses new document/OCR and receipt-understanding claims. No monthly receipt quota or paid-plan metering was introduced.

## Current-record correctness

Transactions now retrieves canonical record source pages in stable `(occurred_on desc, id desc)` order until exhausted, applies current-record absorption/inactivation, and only then applies its customer-visible page. Opaque date/ID cursors provide deterministic Older activity pages. Historical receipt convergence, manual correction leaves, and compound anchors can no longer consume the visible limit before suppression. Reports and exports already use paged canonical financial-summary repositories and the same current-resolution rules.

Receipt history accepts up to 500 recent receipt records in this bounded UI iteration so 100–300-file catch-up batches remain visible. Stable cursor pagination for histories beyond that size remains a follow-up; the durable queue and canonical records themselves are not capped.

## Security and privacy

- Storage remains private and owner-prefixed.
- Registration derives Business and actor from the authenticated session.
- Composite Business foreign keys prevent cross-tenant job targets.
- Customers can read only their receipt/statement projections and cannot claim or mutate jobs/results.
- Provider credentials and service-role credentials remain server-only.
- Server validation enforces approved MIME values, byte bounds, storage paths, and exact hashes.
- Workers download private objects server-side and send image bytes directly; no public object URL is created.
- Result/audit metadata is append-only and bounded.

## Intentionally deferred

- canonical statement text/table extraction and transaction ingestion;
- combined-PDF logical statement-period splitting;
- general operator queue-management UI (owned failed-receipt retry is supported);
- production scheduler activation and alert delivery;
- canonical activation of multimodal receipt understanding;
- plan/billing quotas;
- generic document-management UI;
- cursor pagination beyond the bounded receipt/statement history views.
