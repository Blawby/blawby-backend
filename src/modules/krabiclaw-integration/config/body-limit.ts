/**
 * Every facade request body is bounded before any route-scoped middleware
 * (and therefore before D1) runs (R23). 64 KiB is generous for the bounded
 * facade DTOs this module accepts — a handful of canonical-text IDs, a UUID
 * or two, and modest legal-payload text fields (e.g. an intake description
 * or a prospective client's contact email) — while still rejecting a body
 * built to exhaust request-parsing resources before validation. Revisit
 * alongside the rate-limit budgets in `rate-limits.ts` once U10 has traffic
 * data for the largest legitimate facade payload (likely a staff intake
 * triage note).
 */
export const MAX_FACADE_BODY_BYTES = 64 * 1024;
