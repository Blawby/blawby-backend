# Blawby-TS Project Overview

## Purpose
Legal practice management SaaS backend (API server) with Stripe billing, multi-tenant organizations, onboarding, invoicing, and client intake management.

## Tech Stack
- **Runtime**: Node.js (TypeScript)
- **Framework**: Hono (HTTP server)
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Better Auth with @better-auth/stripe plugin
- **Payments**: Stripe SDK v20
- **Task Queue**: Graphile Worker
- **Build**: tsup
- **Package Manager**: pnpm
- **Linting**: ESLint + oxlint

## Key Architecture
- `src/modules/` - Feature modules (subscriptions, invoices, onboarding, webhooks, etc.)
- `src/shared/` - Shared utilities, auth config, repositories, services
- `src/workers/` - Graphile Worker tasks
- `src/schema/` - Database schema (better-auth-schema.ts has core auth tables)
- `scripts/` - Operational scripts (sync-stripe-subscriptions.ts, sync-schemas.ts)

## Stripe Webhook Flow
1. Stripe → `/api/auth/stripe/webhook` (Better Auth plugin endpoint)
2. Better Auth processes subscription lifecycle events internally, then calls custom hooks
3. `onEvent` handler stores events in DB and queues non-subscription events to Graphile Worker
4. Worker processes product/price/invoice/onboarding/payment events
5. `customer.subscription.*` events are handled entirely by Better Auth + custom hooks

## Important Patterns
- Result type pattern (ok/internalError/notFound) for service returns
- Subscription table managed by Better Auth; custom `subscriptionLineItems` and `subscriptionEvents` tables managed by our code
- Organizations link to subscriptions via `activeSubscriptionId`
