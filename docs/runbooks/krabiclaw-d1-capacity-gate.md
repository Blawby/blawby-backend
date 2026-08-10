# KrabiClaw D1 capacity gate — runbook

Covers the production-shaped capacity gate for `krabiclawDirectoryService`
(`src/modules/krabiclaw-integration/services/krabiclaw-directory.service.ts`),
which calls KrabiClaw's D1 database over the Cloudflare REST API using the
official `cloudflare` SDK, not a Worker binding. Per KTD7 of
`docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md`: this transport
must pass a production-shaped capacity gate before it carries real traffic —
if it doesn't, replace it with a D1-bound Worker (Unit 11) before Unit 3 starts.

## Why this exists

Two independent limits bound this transport, and both matter:

1. **Account-wide API rate limit.** Cloudflare's global API rate limit —
   1,200 requests per 5 minutes per user, cumulative across every
   authentication method on the account — applies to every REST call this
   adapter makes, shared with every other REST caller on the same account.
2. **Per-database query serialization.** Each individual D1 database is
   single-threaded and processes queries one at a time; once saturated it
   returns an "overloaded" error rather than queueing indefinitely.
   Throughput is bounded by query duration (D1's own docs cite roughly
   1,000 queries/second at ~1ms average query time), and this constraint is
   per-database — it does not improve by spreading load across REST callers
   or account tokens.

Two failure modes to catch before staging traffic depends on this:

1. Sustained legal-facade lookup volume alone is a meaningful fraction of
   either limit.
2. The adapter's one-retry-on-transient-error behavior (`isRetryableD1Error`
   in `d1-error-classification.ts`) amplifies load exactly when D1 is already
   struggling — the worst time for it to double request volume against a
   database that's already returning overloaded errors.

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
   the adapter's 3-second budget, the rate of "overloaded" responses from D1
   itself (this is the per-database saturation signal — distinct from a
   plain error rate), the rate of deadline/timeout failures, and the request
   rate against Cloudflare's account-wide API limit (fetch current numbers
   from the Cloudflare dashboard/docs at gate time rather than trusting a
   cached figure here, since these are live platform numbers, not constants
   this repo owns).
4. **Pass condition:** projected sustained peak load, **including retry
   amplification**, stays under 50% of Cloudflare's account-wide API rate
   limit, and produces no "overloaded" or deadline-failure responses from D1
   at that load. Both conditions are required — passing the account-wide
   rate check does not clear the per-database serialization limit, and vice
   versa. If the per-database limit is the binding constraint, that failure
   mode does not improve by requesting a higher account-wide rate limit; it
   requires the Unit 11 Worker fallback instead (see below).

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

Record the measured numbers (latency percentiles, overloaded/deadline-failure
rate, % of the account-wide API rate limit) in the environment's staging
verification checklist before enabling any facade route that depends on this adapter
(Unit 8). Re-run this gate if KrabiClaw's D1 database size, query patterns,
or the account's other REST-API callers change materially — a passing
result is a point-in-time measurement, not a permanent guarantee.
