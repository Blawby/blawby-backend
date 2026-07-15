# Backend durable recovery gate

This backend is the source of truth for identity, authorization, practices,
clients, matters, billing, intakes, approvals/audit evidence, and upload
metadata. Public launch remains blocked until a human operator completes the
timed Railway and R2 rehearsal described here and attaches sanitized evidence
to `Blawby/blawby-ai-chatbot#723`.

## Objectives

- Recovery point objective: at most 15 minutes of durable writes lost.
- Recovery time objective: a compatible backend is serving verified restored
  data within four hours of declaring recovery.
- Recovery always forks/restores forward. It never depends on a destructive
  schema reversal or wiping the source service.

## Durable ownership

| Domain | Source of truth | Required recovery mechanism |
| --- | --- | --- |
| Better Auth users, sessions, accounts, organizations, members, invitations, OAuth clients/grants/tokens, API keys | Railway PostgreSQL | Railway PostgreSQL PITR |
| Practice details/services/preferences/member profiles | Railway PostgreSQL | Railway PostgreSQL PITR |
| Clients, matters and all matter children, engagements | Railway PostgreSQL | Railway PostgreSQL PITR |
| Invoices, line items, payments, refunds, subscriptions, payouts, trust transactions | Railway PostgreSQL | Railway PostgreSQL PITR plus Stripe reconciliation |
| Intake templates, intake records, conversation mirrors/events, conflict-review evidence | Railway PostgreSQL | Railway PostgreSQL PITR |
| Pending approvals, audit/event records, upload metadata and upload audit records | Railway PostgreSQL | Railway PostgreSQL PITR |
| Original uploaded bytes and generated signed engagement artifacts | Cloudflare R2 bucket named by `CLOUDFLARE_R2_BUCKET_NAME` | R2 durability plus 30-day bucket lock |
| Graphile jobs, email jobs, event retry work | Retryable/derived | Replay only work with a proven stable idempotency key; regenerate or quarantine all other work from durable source records |

Stripe is authoritative for provider objects, but persisted invoice, trust, and
reconciliation state remains durable PostgreSQL data. A restore must reconcile
forward from Stripe event IDs; it must not blindly replay charges or webhooks.

## Required provider configuration

### Railway PostgreSQL

Enable Railway Point-in-Time Recovery (PITR) for the production PostgreSQL
service. Daily volume backups alone have a 24-hour interval and cannot meet the
15-minute RPO. PITR continuously archives WAL with a 60-second archive timeout
and restores into a new sibling service, leaving the source untouched.

Human setup and proof:

1. Enable PITR in the production PostgreSQL service's Backups tab.
2. Wait for the first base backup; record the displayed restore window.
3. Retain at least 30 days and also enable daily, weekly, and monthly volume
   backup schedules as a second layer.
4. Insert only the marked synthetic launch-test graph described below.
5. Restore a sibling service to the recorded timestamp.
6. Enable PITR on the restored sibling, wait for its base backup, and verify
   archive freshness before considering that sibling eligible for cutover.
7. Run integrity verification against the sibling before changing any
   connection string.
8. Record source/restored service and deployment IDs, PITR/archive results,
   timestamps, counts, and boolean integrity results. Never record connection
   strings or row payloads.

Provider references: [Railway Point-in-Time Recovery](https://docs.railway.com/volumes/point-in-time-recovery),
[Railway volume backups](https://docs.railway.com/volumes/backups).

### Cloudflare R2

R2 hardware durability does not undo an application or operator delete. Apply
a 30-day bucket-lock rule to the production bucket configured by
`CLOUDFLARE_R2_BUCKET_NAME`. The code already soft-deletes upload metadata; do
not add direct object deletion inside the retention window.

Human setup and proof:

1. Give the backend runtime a bucket-scoped S3 token limited to required object
   data operations. It must not be able to create, change, or remove lock rules.
2. Use a separate human/control-plane identity for bucket-lock administration;
   require provider audit evidence and an alert for every lock-rule edit.
3. Record the production bucket name without exposing either credential.
4. Add a 30-day lock rule covering original upload and signed-artifact prefixes.
5. Ensure no expiration lifecycle applies to those prefixes.
6. Compute a SHA-256 digest before uploading a synthetic launch-test object.
   Record that digest, storage key, byte size, and owning upload metadata ID.
   The current upload row does not persist a canonical checksum, and an R2 ETag
   must not be treated as one.
7. Verify overwrite and delete are rejected during retention.
8. Soft-delete and restore the metadata row, then download the object and
   verify its SHA-256 against the recorded pre-upload digest. Verify the
   restored metadata row's storage key and size independently.

Provider references: [R2 durability](https://developers.cloudflare.com/r2/reference/durability/),
[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/),
[R2 delete semantics](https://developers.cloudflare.com/r2/objects/delete-objects/).

## Synthetic restore graph

Use a dedicated launch-test organization and synthetic identifiers. The graph
must include:

- owner identity, organization, owner membership, session/OAuth authorization;
- one client, matter, task, time entry, invoice and line item;
- one intake and one approval/audit record;
- one upload metadata/audit record linked to one locked R2 object;
- a second organization as a cross-tenant negative control.

After restoring the Railway sibling, verify:

- every expected row exists exactly once;
- all foreign keys and organization IDs still connect to the launch-test org;
- the negative-control organization cannot read or mutate the restored graph;
- financial totals and trust/operating classifications match pre-loss values;
- no pending approval became executed during recovery;
- the R2 storage key and size match restored metadata, and the downloaded
  bytes match the separately recorded pre-upload SHA-256;
- migrations recorded at the selected restore point are compatible with the
  backend commit chosen for recovery.

## Migration and cutover order

1. Fence writes to the entire shared PostgreSQL database when recovery is
   declared; practice-scoped fencing is insufficient because every organization
   shares the restore boundary. If a global fence is impossible, durably capture
   every post-target write from every organization and prove all captured writes
   can be replayed before switching the backend connection.
2. Record exact backend commit/deployment, database restore window, current
   migration journal before changing anything.
3. Restore Railway PostgreSQL to a sibling service.
4. Enable PITR on the restored sibling and verify its base backup plus current
   archive health. Do not cut over to a restored service that has no recovery
   chain of its own.
5. Deploy the exact compatible backend commit against that sibling.
6. Apply only additive forward migrations required by that commit.
7. Run tenant, referential, financial, approval, and R2 byte-integrity
   verification.
8. Replay every captured post-target database write when global fencing was not
   possible, then repeat the integrity verification.
9. Change the backend connection only after verification passes; retain the
   original service for the incident window.
10. Reconcile Stripe and retryable jobs forward only when the work type has a
    persisted stable idempotency/event ID. Regenerate or quarantine email and
    other derived work that lacks proven duplicate suppression.

Never run down migrations, drop new columns to match old code, wipe a Railway
volume, empty an R2 bucket, or replay payment events without checking persisted
idempotency state.

## Evidence and pass condition

The sanitized evidence artifact is retained for 90 days and contains only:

- exact backend/frontend commits and provider deployment IDs;
- rehearsal/restore timestamps, Railway restore-window bounds, restored-sibling
  PITR state, and archive-health result;
- global write-fence mode, captured/replayed post-target write counts, and the
  all-tenant replay result when writes were not globally blocked;
- R2 bucket name, lock-rule ID, retention duration, separate control-plane
  audit-event ID, and pre-upload SHA-256;
- synthetic row counts and boolean integrity outcomes;
- a synthetic durable marker's source watermark and commit timestamp, the
  highest recovered marker watermark and commit timestamp, and whether the
  expected restore-boundary marker exists;
- measured RPO calculated from the source marker commit time to the recovered
  marker boundary. The newest missing write is the first source marker after
  the highest recovered marker, not an operator-selected sample;
- recovery declaration-to-verification duration and measured RTO.

It contains no PII, secrets, connection strings, tokens, cookies, storage state,
or object bytes. The gate passes only when measured RPO is no more than 15
minutes and measured RTO is no more than four hours.
