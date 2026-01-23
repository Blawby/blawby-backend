# Implementation Plan: Clients Module

## Overview

Create a new `clients` module to manage practice clients (law firm customers) with:
- **Module name:** `clients`
- **Table name:** `practice_clients`
- **Separate from** `practice-client-intakes` (linked via events)

Based on Laravel's customers module - clients are entity data (name, email, phone, etc.) without separate settings tables.

## Module Structure

```
src/modules/clients/
├── database/
│   ├── schema/
│   │   ├── practice-clients.schema.ts
│   │   └── practice-client-memos.schema.ts
│   └── queries/
│       ├── practice-clients.queries.ts
│       └── practice-client-memos.queries.ts
├── services/
│   ├── clients.service.ts
│   └── client-memos.service.ts
├── validations/
│   ├── clients.validation.ts
│   └── client-memos.validation.ts
├── events/
│   └── clients.events.ts
├── handlers.ts
├── routes.ts
├── routes.config.ts
├── http.ts
└── index.ts
```

---

## Database Schema

### 1. practice_clients

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, defaultRandom() |
| organization_id | uuid | FK → organizations, NOT NULL |
| name | varchar(255) | NOT NULL |
| email | varchar(255) | NOT NULL |
| phone | varchar(50) | E164 format |
| address_line_1 | text | |
| address_line_2 | text | |
| city | varchar(100) | |
| state | varchar(100) | |
| postal_code | varchar(20) | |
| country | varchar(2) | default 'US' |
| stripe_customer_id | varchar(255) | |
| status | varchar(20) | 'lead', 'active', 'inactive', 'archived' |
| currency | varchar(3) | default 'usd' |
| event_name | varchar(255) | Source tracking |
| intake_id | uuid | FK → practice_client_intakes, optional |
| deleted_at | timestamp | Soft delete |
| deleted_by | uuid | FK → users |
| created_at | timestamp | |
| updated_at | timestamp | |

**Indexes:** organization_id, email, status, stripe_customer_id, deleted_at, created_at
**Constraints:** UNIQUE(organization_id, email)

### 2. practice_client_memos

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK → practice_clients, CASCADE |
| created_by | uuid | FK → users, CASCADE |
| content | text | NOT NULL |
| event_time | timestamp | Optional event timestamp |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## API Endpoints

### Clients

| Method | Path | Description |
|--------|------|-------------|
| GET | /organizations/{orgId}/clients | List clients with search/filter |
| POST | /organizations/{orgId}/clients | Create client (+ Stripe customer) |
| GET | /organizations/{orgId}/clients/{uuid} | Get client |
| PUT | /organizations/{orgId}/clients/{uuid} | Update client |
| DELETE | /organizations/{orgId}/clients/{uuid} | Soft delete client |

### Client Memos

| Method | Path | Description |
|--------|------|-------------|
| GET | /organizations/{orgId}/clients/{uuid}/memos | List memos |
| POST | /organizations/{orgId}/clients/{uuid}/memos | Create memo |
| PUT | /organizations/{orgId}/clients/{uuid}/memos/{memoId} | Update memo |
| DELETE | /organizations/{orgId}/clients/{uuid}/memos/{memoId} | Delete memo |

---

## Event Integration

### New Event Types (add to event-types.ts)

```typescript
// Client events
CLIENT_CREATED = 'client.created',
CLIENT_UPDATED = 'client.updated',
CLIENT_DELETED = 'client.deleted',
CLIENT_STATUS_CHANGED = 'client.status_changed',
```

### Event Flow: Intake → Client

1. User completes intake payment
2. `INTAKE_PAYMENT_SUCCEEDED` event fires
3. Client event handler listens and:
   - Checks if client with email already exists in organization
   - If not exists, creates a `practice_client` record with status='active'
   - Sets `intake_id` to link back to the intake
   - Creates Stripe customer
   - Publishes `CLIENT_CREATED` event

---

## Stripe Integration

- **On client create (API):** Create Stripe customer with email, name, phone, metadata
- **On client create (from intake):** Create Stripe customer with intake metadata
- **On client update:** Sync changes to Stripe customer (email, name, phone)
- **Store:** `stripe_customer_id` in practice_clients table

---

## Matters Integration

Add `practice_client_id` column to `matters` table:

```typescript
practice_client_id: uuid('practice_client_id').references(() => practiceClients.id, {
  onDelete: 'set null',
}),
```

This allows matters to be linked to practice_clients while keeping existing `customer_id` (users) for backward compatibility.

---

## Implementation Steps

### Phase 1: Database Layer
1. Create `src/modules/clients/database/schema/practice-clients.schema.ts`
2. Create `src/modules/clients/database/schema/practice-client-memos.schema.ts`
3. Run `pnpm run schemas:sync` to register schemas
4. Create and run database migration

### Phase 2: Repository Layer
1. Create `practice-clients.queries.ts` - CRUD, search, filter, pagination
2. Create `practice-client-memos.queries.ts` - CRUD for memos

### Phase 3: Validation Schemas
1. Create `clients.validation.ts` - create/update/list schemas
2. Create `client-memos.validation.ts` - create/update memo schemas

### Phase 4: Service Layer
1. Create `clients.service.ts`:
   - createClient (with Stripe customer creation)
   - getClientById, listClients, updateClient, deleteClient
   - createClientFromIntake (for event handler)
2. Create `client-memos.service.ts` - CRUD operations

### Phase 5: Event Integration
1. Add CLIENT_* events to `event-types.ts`
2. Add CLIENT domain to EVENT_DOMAINS
3. Create `clients.events.ts`:
   - Subscribe to `INTAKE_PAYMENT_SUCCEEDED`
   - Auto-create client when intake payment succeeds (if not exists)
4. Register event handlers in module index

### Phase 6: Routes & Handlers
1. Create `routes.ts` - OpenAPI route definitions
2. Create `handlers.ts` - route handlers
3. Create `http.ts` - Hono app setup
4. Create `routes.config.ts` - auth middleware config
5. Create `index.ts` - module exports

### Phase 7: Matters Integration
1. Add `practice_client_id` column to matters schema
2. Create migration for the new column
3. Update matters queries to support filtering by practice_client_id

---

## Critical Files to Modify

| File | Action |
|------|--------|
| `src/shared/events/enums/event-types.ts` | Add CLIENT_* events |
| `src/modules/matters/database/schema/matters.schema.ts` | Add practice_client_id column |
| `src/modules/matters/database/queries/matters.queries.ts` | Add client filter |

---

## Verification

1. **Database:** Run migration, verify tables created (`practice_clients`, `practice_client_memos`)
2. **API:** Test CRUD endpoints via REST client
3. **Event Flow:** Create an intake payment, verify client auto-created if not exists
4. **Stripe:** Verify Stripe customer created with correct metadata
5. **Memos:** Test memo CRUD operations
6. **Matters:** Verify clients can be linked to matters via `practice_client_id`
