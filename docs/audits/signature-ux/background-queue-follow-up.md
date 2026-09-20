# Separate engineering follow-up: background queue

This flagship UX pass changes no workers, leases, scheduling, action-index rebuilding or ordinary-answer architecture.

The preceding ingestion certification measured PDF intake about 3.5 seconds, useful first work about 4.6 seconds, then later jobs queued 115–216 seconds while actual execution took about 2–3 seconds. Those measurements remain historical evidence, not a new benchmark from this change.

Next bounded engineering task:

1. Trace one fresh import by document, account and job identity, including enqueue, lease, start, finish and dependent invalidation timestamps.
2. Verify the documented overlapping evaluation jobs and scope-expansion fingerprint / legacy-noop protocol mismatch against the current worker.
3. Unify the producer/consumer completion contract and coalesce only provably duplicate evaluations. Preserve distinct evidence versions and affected records.
4. Measure queue age, execution, retries and time to independent ready action before/after on isolated staging tenants.
5. Retest stale-version, dependency readiness and uninterrupted unrelated work. Do not hide settling behind candidate questions or block ordinary answers on worker completion.

No scheduler, concurrency or worker rewrite is bundled with the visual changes.
