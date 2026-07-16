# Intake enrichment

Completed intakes are enriched asynchronously for staff triage. Both completion paths trigger the same durable flow:

- a payment-bypassed `intake.submitted` event;
- a paid `intake_payment.succeeded` event;
- a staff-approved `POST /api/practice-client-intakes/{uuid}/enrichment` re-run.

## State and retry contract

`enrichment_status` is `not_requested`, `pending`, `processing`, `succeeded`, or `failed`. Each request increments `enrichment_version`; the Graphile job key includes organization, intake, and version. A worker can claim only the current pending/failed version. Older jobs skip without calling the provider or overwriting newer work.

Each claimed attempt increments `enrichment_attempt_count`. The same locked Graphile job may reclaim its current `processing` version after a worker crash. Failures store a stable code (`provider_not_configured`, `provider_failure`, `malformed_response`, or `enrichment_failed`) and are rethrown so Graphile Worker retains its normal retry behavior. Raw provider errors are not persisted.

There is no fallback output. Missing Cloudflare AI configuration, provider errors, invalid JSON, extra fields, or invalid values fail the job visibly.

## Data rules

The model receives authoritative intake fields and up to 100 persisted conversation messages. It returns strict JSON containing an internal summary, urgency, and desired outcome.

- `transcript_summary` is replaced by the current enrichment version.
- Client-entered `urgency` and `desired_outcome` are never overwritten; AI values fill only missing fields.
- `case_strength`, jurisdiction status, document presence, and triage decisions are not AI-authored.
- The prompt does not add the intake's direct client-name or email fields, prohibits legal advice and merits predictions, and labels urgency as an internal staff signal.
- Enrichment state and summary are exposed only by staff intake reads.

The provider/model contract is the backend Cloudflare Workers AI Gateway configuration introduced by engagement generation. Provider configuration is required; the backend does not substitute browser-generated or heuristic results.
