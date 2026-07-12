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
| Graphile jobs, email jobs, event retry work | Retryable/derived | Replay idempotent source events after the source fault is fixed |

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
6. Run integrity verification against the sibling before changing any
   connection string.
7. Record source/restored service and deployment IDs, timestamps, counts, and
   boolean integrity results. Never record connection strings or row payloads.

Provider references: [Railway Point-in-Time Recovery](https://docs.railway.com/volumes/point-in-time-recovery),
[Railway volume backups](https://docs.railway.com/volumes/backups).

### Cloudflare R2

R2 hardware durability does not undo an application or operator delete. Apply
a 30-day bucket-lock rule to the production bucket configured by
`CLOUDFLARE_R2_BUCKET_NAME`. The code already soft-deletes upload metadata; do
not add direct object deletion inside the retention window.

Human setup and proof:

1. Record the production bucket name without exposing R2 credentials.
2. Add a 30-day lock rule covering original upload and signed-artifact prefixes.
3. Ensure no expiration lifecycle applies to those prefixes.
4. Upload a synthetic launch-test object and record its storage key, byte size,
   ETag/checksum, and owning upload metadata ID.
5. Verify overwrite and delete are rejected during retention.
6. Soft-delete and restore the metadata row, then verify the exact bytes remain
   downloadable and match the checksum.

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
- the R2 object size/checksum matches its restored metadata;
- migrations recorded at the selected restore point are compatible with the
  backend commit chosen for recovery.

## Migration and cutover order

1. Stop or fence writes for the affected practice when recovery is declared.
2. Record exact backend commit/deployment, database restore window, and current
   migration journal before changing anything.
3. Restore Railway PostgreSQL to a sibling service.
4. Deploy the exact compatible backend commit against that sibling.
5. Apply only additive forward migrations required by that commit.
6. Run tenant, referential, financial, approval, and R2 checksum verification.
7. Change the backend connection only after verification passes; retain the
   original service for the incident window.
8. Reconcile Stripe and retryable jobs forward by idempotency/event ID.

Never run down migrations, drop new columns to match old code, wipe a Railway
volume, empty an R2 bucket, or replay payment events without checking persisted
idempotency state.

## Evidence and pass condition

The sanitized evidence artifact is retained for 90 days and contains only:

- exact backend/frontend commits and provider deployment IDs;
- rehearsal/restore timestamps and Railway restore-window bounds;
- R2 bucket name, lock-rule ID and retention duration;
- synthetic row counts, object checksum, and boolean integrity outcomes;
- newest missing write and measured RPO;
- recovery declaration-to-verification duration and measured RTO.

It contains no PII, secrets, connection strings, tokens, cookies, storage state,
or object bytes. The gate passes only when measured RPO is no more than 15
minutes and measured RTO is no more than four hours.
