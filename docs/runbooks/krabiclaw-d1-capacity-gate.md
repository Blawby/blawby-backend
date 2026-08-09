# KrabiClaw D1 capacity gate — runbook

Covers the production-shaped capacity gate for `krabiclawDirectoryService`
(`src/modules/krabiclaw-integration/services/krabiclaw-directory.service.ts`),
which calls KrabiClaw's D1 database over the Cloudflare REST API using the
official `cloudflare` SDK, not a Worker binding. Per KTD7 of
`docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md`: this transport
must pass a production-shaped capacity gate before it carries real traffic —
if it doesn't, replace it with a D1-bound Worker (Unit 11) before Unit 3 starts.

## Why this exists

D1's REST API is account-token-scoped, not per-database. Every fixed-query
call this adapter makes shares Cloudflare's account-wide D1 concurrent-request
limit with every other REST caller on the same account. Two failure modes to
catch before staging traffic depends on this:

1. Sustained legal-facade lookup volume alone is a meaningful fraction of the
   account's D1 REST budget.
2. The adapter's one-retry-on-transient-error behavior (`isRetryableD1Error`
   in `d1-error-classification.ts`) amplifies load exactly when D1 is already
   struggling — the worst time for it to double request volume.

## Running the gate

Run this in staging, against the real KrabiClaw staging D1 database and a
real scoped read-only Cloudflare API token — never against local/dev, since
the whole point is measuring real network + D1 REST behavior.

1. Set `CLOUDFLARE_D1_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
   `CLOUDFLARE_D1_API_TOKEN` to the staging values.
2. Drive `krabiclawDirectoryService.getOrganizationDirectoryRecord` and
   `getUserDirectoryRecord` at the **projected peak concurrent rate** for the
   route families that will depend on it (see the master plan's Route Scope
   table — practice, Connect, and intake reads all resolve through this
   adapter). Include the retry path: some fraction of requests should hit a
   simulated 429/5xx so the one-retry behavior is exercised at load, not just
   the happy path.
3. Record, over a sustained window (not a burst): p50/p95/p99 latency against
   the adapter's 3-second budget, error rate, and the peak concurrent D1 REST
   request count observed (Cloudflare dashboard or account-level metrics —
   fetch current numbers from the Cloudflare dashboard/docs at gate time
   rather than trusting a cached figure here, since D1 REST limits are a
   live platform number, not a constant this repo owns).
4. **Pass condition:** projected sustained peak load, **including retry
   amplification**, stays under 50% of the account's current D1 REST
   concurrent-request limit. This is deliberately conservative — half the
   ceiling, not the whole ceiling — because this account-wide budget is
   shared with every other REST caller on the account, present and future.

## If the gate fails

Do not proceed to Unit 3 with this transport. Unit 11 ("Add the conditional
D1 Worker fallback") replaces the transport with a dedicated D1-bound Worker
in the KrabiClaw repository, authenticated with its own per-environment
server credential, and Blawby calls that Worker instead of Cloudflare's REST
API directly. `krabiclawDirectoryService`'s public interface
(`getOrganizationDirectoryRecord` / `getUserDirectoryRecord`) is designed to
stay the same either way — only `runFixedQuery`'s transport changes — so a
Unit 11 swap should not require touching any caller of this service.

## If the gate passes

Record the measured numbers (latency percentiles, peak concurrent request
count, % of account limit) in the environment's staging verification
checklist before enabling any facade route that depends on this adapter
(Unit 8). Re-run this gate if KrabiClaw's D1 database size, query patterns,
or the account's other REST-API callers change materially — a passing
result is a point-in-time measurement, not a permanent guarantee.
