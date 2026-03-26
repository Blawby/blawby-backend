# User & Client Identity Architecture Plan

**Date**: 2026-03-26
**Status**: Draft
**Phase**: MVP — no legacy constraints, remove freely

---

## Problem

The codebase conflates two completely different concepts in one confusingly-named table:

- `users` — anyone who can log in (Better Auth core)
- `user_details` — law firm client CRM records (org-scoped)

The name `user_details` suggests it's a settings/preferences extension for users. It's not. It's a client record — it holds `status`, `stripe_customer_id`, `intake_id`, and is the FK target for `invoices.client_id` and `matters.client_id`. The name is wrong and causes constant confusion.

Additionally `users.stripeCustomerId` is dead code — it is never written to or read from anywhere.

---

## Domain Model (target state)

```
┌──────────────────────────────────────────────────────────────┐
│ IDENTITY LAYER (Better Auth — do not restructure)            │
│                                                              │
│  users                                                       │
│    primaryWorkspace: 'practice' | 'client' | 'public'        │
│    ← THE user type discriminator, set at placement time      │
└──────────────────────────────────────────────────────────────┘
           │ user_id (nullable)                 │ user_id
           ▼                                    ▼
┌─────────────────────────┐       ┌─────────────────────────────┐
│ clients                 │       │ members                     │
│ (org-scoped CRM record) │       │ (org-scoped practice staff) │
│  organization_id        │       │  organization_id            │
│  user_id?  ← nullable   │       │  user_id  NOT NULL          │
│  email, name            │       │  role: owner|admin|member   │
│  stripe_customer_id     │       └─────────────────────────────┘
│  status                 │                    │
│  intake_id?             │       ┌────────────┴────────────────┐
└─────────────────────────┘       │ organizations               │
           │                      │  stripeCustomerId (SaaS)    │
           │ client_id            └─────────────────────────────┘
           ▼
┌──────────────────────┐    ┌──────────────────────────────────┐
│ matters              │    │ invoices                         │
│  client_id           │    │  client_id                       │
│  organization_id     │    │  organization_id                 │
└──────────────────────┘    │  connected_account_id            │
                            └──────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ intakes (practice_client_intakes)                        │
│  organization_id                                         │
│  client_id?  ← set when intake converts to a client     │
└──────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### 1. Rename `user_details` → `clients`

`user_details` is a client CRM record. Call it what it is.

All FK columns in `invoices`, `matters`, `trust_transactions`, `practice_client_memos` already use `client_id` — they just happen to point to a confusingly-named table. The rename makes the model self-documenting.

### 2. `clients.user_id` becomes nullable

A client (lead from an intake, for example) can exist in the system before they ever create a user account. `user_id` is set when the client claims their account or is linked to an existing user.

### 3. `clients.email` and `clients.name` stored directly

Client identity should not depend on joining `users`. A lead-stage client with no user account still has a name and email (from intake). These fields live on `clients` so the record is self-contained.

### 4. `users.stripeCustomerId` is removed

Dead code. The two active Stripe customer IDs in the system are:
- `organizations.stripeCustomerId` → org's Blawby SaaS subscription (Better Auth Stripe plugin)
- `clients.stripe_customer_id` → client's invoice billing (platform, on_behalf_of)

### 5. `primaryWorkspace` is adopted as the user type discriminator

`users.primaryWorkspace` already exists but is never enforced. We set it at placement time:

| Value | Meaning | When set |
|---|---|---|
| `'practice'` | Lawyer / staff | On first org membership creation |
| `'client'` | Law firm client | On client record creation / intake conversion |
| `'public'` | Not yet placed | Default for new signups |

### 6. Stripe customer creation moves to lazy (invoice send time)

Currently a Stripe customer is created eagerly when a client record is created. This couples client creation to Stripe availability and creates orphaned customers for leads that never become active.

New flow: `clients.stripe_customer_id` starts as `null`. On first invoice send, if it's null, create the customer using `clients.email` / `clients.name` (not the joined user).

---

## Stripe Customer ID Map (final state)

```
PLATFORM STRIPE ACCOUNT
  ├── organizations.stripeCustomerId
  │     └── Law firm paying Blawby SaaS subscription
  │         Managed by: Better Auth Stripe plugin
  │
  └── clients.stripe_customer_id
        └── Client paying legal invoices to the law firm
            Created: Lazily, on first invoice send
            Used with: on_behalf_of → connected account transfer

CONNECTED ACCOUNT (stripe_connected_accounts.stripe_account_id)
  └── Receives invoice payments via transfer from platform
```

---

## Implementation Plan

### Phase 1 — DB Schema

#### 1.1 Rename table and module

**DB:**
```sql
ALTER TABLE user_details RENAME TO clients;
-- Rename indexes and constraints to match
ALTER INDEX user_details_org_idx RENAME TO clients_org_idx;
ALTER INDEX user_details_user_idx RENAME TO clients_user_idx;
ALTER INDEX user_details_status_idx RENAME TO clients_status_idx;
ALTER INDEX user_details_stripe_id_idx RENAME TO clients_stripe_id_idx;
ALTER INDEX user_details_address_idx RENAME TO clients_address_idx;
ALTER INDEX user_details_deleted_at_idx RENAME TO clients_deleted_at_idx;
ALTER INDEX user_details_created_at_idx RENAME TO clients_created_at_idx;
ALTER TABLE clients RENAME CONSTRAINT user_details_org_user_unique TO clients_org_user_unique;
```

**Drizzle schema** (`user-details.schema.ts` → `clients.schema.ts`):
```typescript
export const clients = pgTable('clients', {
  ...
});
export type SelectClient = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
```

#### 1.2 Make `clients.user_id` nullable + add email/name

```sql
ALTER TABLE clients ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE clients
  ADD COLUMN email varchar(255),
  ADD COLUMN name varchar(255);
-- Backfill from users
UPDATE clients c
SET email = u.email, name = u.name
FROM users u WHERE c.user_id = u.id AND c.email IS NULL;
-- Change FK onDelete from cascade to set null
ALTER TABLE clients DROP CONSTRAINT user_details_user_id_users_id_fk;
ALTER TABLE clients ADD CONSTRAINT clients_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

#### 1.3 Remove `users.stripeCustomerId`

```sql
ALTER TABLE users DROP COLUMN stripe_customer_id;
```

Remove from `better-auth-schema.ts`:
```typescript
// DELETE this line:
stripeCustomerId: text('stripe_customer_id'),
```

#### 1.4 Generate and run migration

```bash
pnpm run db:generate
pnpm run db:migrate
```

---

### Phase 2 — Code Rename

Rename everything that references `user_details` / `userDetails` / `UserDetail`:

| Old | New |
|---|---|
| `src/modules/user-details/` | `src/modules/clients/` |
| `user-details.schema.ts` | `clients.schema.ts` |
| `userDetails` (drizzle var) | `clients` |
| `userDetailsSchema` | `clientsSchema` |
| `SelectUserDetail` | `SelectClient` |
| `InsertUserDetail` | `InsertClient` |
| `user-details.queries.ts` | `clients.queries.ts` |
| `userDetailsRepository` | `clientsRepository` |
| `user-details-crud.service.ts` | `clients-crud.service.ts` |
| `userDetailsCrudService` | `clientsCrudService` |
| `user-details.service.ts` | `clients.service.ts` |
| `userDetailsService` | `clientsService` |
| `user-details-stripe.service.ts` | `clients-stripe.service.ts` |
| `userDetailsStripeService` | `clientsStripeService` |
| `UserDetailsCreated` event | `ClientCreated` |
| `UserDetailsUpdated` event | `ClientUpdated` |
| `UserDetailsDeleted` event | `ClientDeleted` |
| `UserDetailsStatusChanged` event | `ClientStatusChanged` |
| `user_details.created` (event string) | `client.created` |

All consumer files (invoices, matters, intakes, auth, etc.) update their imports to the new paths.

---

### Phase 3 — Enforce `primaryWorkspace`

#### 3.1 Set on creation paths

**Practice user** (when a member record is created):
```typescript
await db.update(users).set({ primaryWorkspace: 'practice' }).where(eq(users.id, userId));
```

**Client** (when a clients record is created):
```typescript
if (user && user.primaryWorkspace !== 'practice') {
  await db.update(users).set({ primaryWorkspace: 'client' }).where(eq(users.id, user.id));
}
```

#### 3.2 Backfill existing users

```sql
-- Practice users: have a members record
UPDATE users SET primary_workspace = 'practice'
WHERE EXISTS (SELECT 1 FROM members WHERE members.user_id = users.id)
  AND (primary_workspace IS NULL OR primary_workspace = 'public');

-- Clients: have a clients record, no members record
UPDATE users SET primary_workspace = 'client'
WHERE EXISTS (SELECT 1 FROM clients WHERE clients.user_id = users.id)
  AND NOT EXISTS (SELECT 1 FROM members WHERE members.user_id = users.id)
  AND (primary_workspace IS NULL OR primary_workspace = 'public');
```

#### 3.3 Use in routing and CASL

In `computeRoutingClaims` — fast-path for client users (never get practice workspace access).

In `abilities.ts` — clients can read their own invoices/matters, cannot manage org.

---

### Phase 4 — Lazy Stripe Customer Creation

#### 4.1 Remove eager creation from client creation

In `clients-crud.service.ts`, remove the `clientsStripeService.createCustomer()` call at creation time. `stripe_customer_id` starts as `null`.

#### 4.2 Ensure-customer helper in invoice send flow

In `invoice-stripe-coordination.service.ts`, before `finalizeAndSendStripeFlow`:

```typescript
if (!invoice.client?.stripe_customer_id) {
  const customerId = await clientsStripeService.createCustomer(
    {
      email: invoice.client.email,  // from clients.email directly
      name: invoice.client.name,    // from clients.name directly
      metadata: { client_id: invoice.client_id, organization_id: ctx.organizationId },
    },
    ctx
  );
  if (!customerId) {
    return result.badRequest('Failed to create Stripe customer for client');
  }
  await clientsRepository.update(invoice.client_id, { stripe_customer_id: customerId });
  invoice.client.stripe_customer_id = customerId;
}
```

Note: `createCustomer` now uses `clients.email`/`clients.name` directly — no user join needed.

---

## Migration Order (checklist)

- [ ] **1.1** DB: rename `user_details` → `clients` (indexes + constraints)
- [ ] **1.2** DB: make `clients.user_id` nullable, add `email`/`name`, change FK onDelete
- [ ] **1.2** DB: backfill `clients.email`/`name` from users join
- [ ] **1.3** DB: drop `users.stripe_customer_id`
- [ ] **1.4** Generate + run migration (`pnpm run db:generate && pnpm run db:migrate`)
- [ ] **2** Rename module directory `user-details/` → `clients/`
- [ ] **2** Rename all schema, query, service, event files and their exports
- [ ] **2** Update all consumer imports (invoices, matters, intakes, auth, shared)
- [ ] **2** Update `src/schema/` barrel re-exports
- [ ] **2** Run `pnpm run typecheck` — fix all errors
- [ ] **3.1** Enforce `primaryWorkspace` on member creation and client creation
- [ ] **3.2** Backfill `primaryWorkspace` for existing users
- [ ] **3.3** Use `primaryWorkspace` in `computeRoutingClaims` and CASL abilities
- [ ] **4.1** Remove eager Stripe customer creation from client creation
- [ ] **4.2** Add ensure-customer guard in invoice send flow
- [ ] **4.3** Update `createCustomer` to use `clients.email`/`name` (no user join)

---

## What Does NOT Change

- `client_id` FK column names in `invoices`, `matters`, `trust_transactions` — already correct ✓
- `on_behalf_of` invoice model — stays as-is ✓
- `organizations.stripeCustomerId` — stays, managed by Better Auth ✓
- Better Auth core tables (`users`, `sessions`, `accounts`, etc.) — not touched ✓
- Intake flow — `practice_client_intakes.client_id` just points to `clients` table instead ✓
