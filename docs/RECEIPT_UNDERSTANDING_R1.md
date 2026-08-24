# Receipt Understanding R1

R1 is a write-disabled multimodal shadow evaluator. It answers only “what does this uploaded document appear to say?” Canonical receipt extraction, matching, finalization, bookkeeping, questions, tax treatment, and reporting continue to use their existing trusted paths.

## Flow

1. Receipt registration appends the customer-authored `uploaded` event.
2. A database trigger transactionally requests one versioned `receipt_processing_jobs` row for that immutable document fingerprint.
3. The internal receipt worker claims a bounded batch with leases and `FOR UPDATE SKIP LOCKED`.
4. The server downloads the tenant-scoped canonical object. Images are sent as image input. PDFs are inspected through a temporary in-memory copy containing no more than the first 10 pages; the canonical PDF is never truncated.
5. The configured `ReceiptUnderstandingGateway` returns a strict proposal containing only document type, semantic outcome, merchant, purchase date, total, bounded visual evidence references, ambiguity codes, and document signals.
6. Deterministic code validates schema, evidence grounding, page bounds, date, money, currency, outcome consistency, current fingerprint, and customer-correction precedence.
7. One append-only `receipt_understanding_evaluations` audit row records the proposal or a safe provider failure. Its database constraint permanently enforces `write_enabled=false`.

Semantic outcomes (`understood`, `partial`, `needs_customer_help`, and `not_recognized`) and deterministic rejection complete normally. Technical provider failures use the queue's bounded retry/backoff and eventual dead-letter behavior.

## Configuration

All configuration is server-only:

- `RECEIPT_UNDERSTANDING_ENABLED`
- `RECEIPT_UNDERSTANDING_PROVIDER` (R1 supports only `openai`)
- `RECEIPT_UNDERSTANDING_MODEL` (Terra is the initial quality-evaluation baseline)
- `OPENAI_API_KEY`
- `BOOKKEEPING_WORKER_SECRET`

When disabled or incomplete, the receipt-understanding drain claims nothing. Receipt upload and the existing autonomous OCR/parser/finalizer continue unchanged.

The provider request uses the Responses API, strict JSON Schema output, `store=false`, a bounded timeout, and no unstructured fallback. Untrusted text visible in a document is explicitly data rather than instruction authority.

## Internal operation

Drain up to five jobs:

```sh
curl -fsS -X POST http://localhost:3000/api/internal/receipts/understand \
  -H "Authorization: Bearer $BOOKKEEPING_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  --data '{"batch_size":5}'
```

Inspect the latest sanitized results:

```sh
curl -fsS "http://localhost:3000/api/internal/receipts/understand?limit=5" \
  -H "Authorization: Bearer $BOOKKEEPING_WORKER_SECRET"
```

The inspection response excludes object paths, signed URLs, raw bytes, raw OCR, full prompts, credentials, and unrestricted provider responses.

No production Cron is configured in R1. A later catch-up schedule can invoke the same bounded authenticated drain; expired leases already recover and unprocessed database jobs remain durable.

## Evaluation and activation boundary

Shadow results should be compared with the current parser and human ground truth using synthetic or explicitly approved non-sensitive documents. Before any R2 canonical activation, build a versioned set of at least 500 varied documents and evaluate:

- at least 99% exact total accuracy among accepted `understood` cases;
- at least 98% exact merchant/date/total triplet accuracy among accepted cases;
- below 0.2% false-confident economic triplets;
- at least 99% correct non-receipt rejection/help behavior;
- zero prompt-injection policy bypasses; and
- preservation of every customer correction.

The audit stores bounded agreement codes for current Google Vision/filename fields; it does not duplicate their raw OCR payload. Historical OCR is untouched. Reducing the existing raw OCR retention limit should be a separately reviewed retention change.

## Privacy and production review

R1 sends only the selected receipt document; it does not add customer identity, bank/account data, Plaid metadata, or bookkeeping conclusions. Documents are loaded server-side from private canonical storage. Logs contain only safe operational codes and counts.

`store=false` is necessary but not, by itself, approval for production customer documents. Before production activation, Rick must approve the provider retention posture, any Modified Abuse Monitoring or Zero Data Retention requirements and eligibility, privacy disclosures/consent, document-retention policy, and incident/access procedures. Development shadow tests should use synthetic or separately approved non-sensitive files.

Usage fields support future spend monitoring: request count is the evaluation-row count, with input/output/total tokens, page/image count, attempts, and duration. A later monthly guard can sum accepted, rejected, and provider-error usage by Business and calendar month before claims; R1 deliberately adds no billing or spend-cap behavior.
