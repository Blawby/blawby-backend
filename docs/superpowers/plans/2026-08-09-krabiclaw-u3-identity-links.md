# KrabiClaw U3: Identity Links and Recovery Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the KrabiClaw integration a way to map its external organization/user IDs to minimal local Blawby UUID anchors without creating auth state, and give the intake and Connect domains durable request-key persistence so a lost response can never duplicate a legal record or a Stripe Connect account.

**Architecture:** Two new integration-owned link tables (`krabiclaw_organization_links`, `krabiclaw_user_links`) map external IDs to local `organizations`/`users` rows created on demand under a Postgres advisory lock (create-or-get, race-safe). A nullable `krabiclaw_request_key` column plus a partial unique index on `practice_client_intakes` lets intake creation be replayed safely. A new `krabiclaw_connect_operations` table in the onboarding module gives Connect account creation the same idempotent recovery shape. Nothing in this unit calls Stripe, D1, or wires into any HTTP route — those come in later units (U4+). This unit only builds the schema, repositories, and the identity-resolution service, all provable in isolation with real-Postgres tests.

**Tech Stack:** PostgreSQL, Drizzle ORM (`drizzle-kit generate`), Vitest against a real `blawby_test` database (`test/helpers/db.ts`), `uow.transaction`/`getActiveTx` from `@/shared/database/uow`, `pg_advisory_xact_lock` (existing pattern in `src/modules/trust/services/trust.service.ts`).

## Global Constraints

- R9: external organization and user links live in **separate** one-to-one tables with restrictive (`onDelete: 'restrict'`) foreign keys.
- R12: a local user anchor is created only for human actors; anonymous actors never get one.
- R24 (as applies to this unit's tables): the data this unit persists (links, request keys, Connect snapshots) is stored so later units never need to re-query D1 for it.
- R37: public intake creation must support a durable KrabiClaw request reference plus a Blawby idempotency binding so response loss cannot create a second intake.
- R42: only same-key intake recovery and persisted same-operation Connect recovery may be retried.
- KTD5: external ID link tables map to **minimal** local UUID anchors and must create no memberships, credentials, sessions, roles, or subscriptions.
- Follow `AGENTS.md`: schemas under module `database/schema/` (or the module's existing established convention), queries under `database/queries/`, `uow.transaction`/`getActiveTx` for all transactional work, `HTTPException` for expected failures and raw `Error` for unexpected ones, no `any`/unsafe `as`, `@/` imports only, run `pnpm run db:generate` and inspect the migration for every schema change.
- Do not touch any route, HTTP handler, or CASL check — this unit has no HTTP surface. Do not resurrect `matched_by`/`migration_run_id` from the reverted `refactor/krabiclaw-unified-auth` branch (commit `f311ea7`) — those fields belonged to a bulk-migration design that doesn't match this plan's live create-or-get resolver.

---

### Task 1: Identity link schema (organization + user tables)

**Files:**
- Create: `src/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema.ts`
- Create: `src/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema.ts`
- Create: `src/modules/krabiclaw-integration/database/schema/index.ts`
- Create (generated): a new file in `src/shared/database/migrations/` via `pnpm run db:generate`
- Test: `test/modules/krabiclaw-integration/krabiclaw-identity-links.schema.test.ts`

**Interfaces:**
- Produces: `krabiclawOrganizationLinks` table, `InsertKrabiClawOrganizationLink`, `SelectKrabiClawOrganizationLink` types.
- Produces: `krabiclawUserLinks` table, `InsertKrabiClawUserLink`, `SelectKrabiClawUserLink` types.
- Consumed by: Task 2 (org repository), Task 3 (user repository), Task 4 (resolver service).

Schema-first is the natural order here (there is no logic to red/green — `pnpm run db:generate` needs the table definitions to exist before it can produce a migration, and the migration must be applied before any test can touch the tables). Steps below generate the migration immediately after defining the schema, then add a structural test.

- [ ] **Step 1: Write the organization link schema**

```typescript
// src/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema.ts
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organizations } from '@/schema/better-auth-schema';

export const krabiclawOrganizationLinks = pgTable(
  'krabiclaw_organization_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    external_organization_id: text('external_organization_id').notNull(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('krabiclaw_organization_links_external_id_idx').on(table.external_organization_id),
    uniqueIndex('krabiclaw_organization_links_organization_id_idx').on(table.organization_id),
  ]
);

export type InsertKrabiClawOrganizationLink = typeof krabiclawOrganizationLinks.$inferInsert;
export type SelectKrabiClawOrganizationLink = typeof krabiclawOrganizationLinks.$inferSelect;
```

- [ ] **Step 2: Write the user link schema**

```typescript
// src/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema.ts
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from '@/schema/better-auth-schema';

export const krabiclawUserLinks = pgTable(
  'krabiclaw_user_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    external_user_id: text('external_user_id').notNull(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('krabiclaw_user_links_external_id_idx').on(table.external_user_id),
    uniqueIndex('krabiclaw_user_links_user_id_idx').on(table.user_id),
  ]
);

export type InsertKrabiClawUserLink = typeof krabiclawUserLinks.$inferInsert;
export type SelectKrabiClawUserLink = typeof krabiclawUserLinks.$inferSelect;
```

- [ ] **Step 3: Write the module's schema barrel (required by `drizzle.config.ts`'s glob)**

```typescript
// src/modules/krabiclaw-integration/database/schema/index.ts
export * from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
export * from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';
```

- [ ] **Step 4: Regenerate the aggregated schema barrel and the migration**

Run: `pnpm run sync:schemas`
Expected: `src/schema/index.ts` gains two new `export * from './../modules/krabiclaw-integration/database/schema/...` lines (header timestamp also updates).

Run: `pnpm run db:generate`
Expected: a new `00NN_<slug>.sql` file appears under `src/shared/database/migrations/` containing `CREATE TABLE "krabiclaw_organization_links" ...` and `CREATE TABLE "krabiclaw_user_links" ...`, each with their two unique indexes and a `FOREIGN KEY ... ON DELETE RESTRICT`. Inspect the generated SQL file and confirm both tables, both FKs (`restrict`), and all four unique indexes are present before continuing.

- [ ] **Step 5: Write the structural test**

```typescript
// test/modules/krabiclaw-integration/krabiclaw-identity-links.schema.test.ts
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { krabiclawOrganizationLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
import { krabiclawUserLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';

describe('krabiclaw identity link schema', () => {
  it('keeps organization links one-to-one in both directions', () => {
    const config = getTableConfig(krabiclawOrganizationLinks);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(indexNames).toContain('krabiclaw_organization_links_external_id_idx');
    expect(indexNames).toContain('krabiclaw_organization_links_organization_id_idx');
  });

  it('restricts organization anchor deletion', () => {
    const config = getTableConfig(krabiclawOrganizationLinks);
    const foreignKey = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'organization_id')
    );

    expect(foreignKey?.onDelete).toBe('restrict');
  });

  it('keeps user links one-to-one in both directions', () => {
    const config = getTableConfig(krabiclawUserLinks);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(indexNames).toContain('krabiclaw_user_links_external_id_idx');
    expect(indexNames).toContain('krabiclaw_user_links_user_id_idx');
  });

  it('restricts user anchor deletion', () => {
    const config = getTableConfig(krabiclawUserLinks);
    const foreignKey = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'user_id')
    );

    expect(foreignKey?.onDelete).toBe('restrict');
  });
});
```

- [ ] **Step 6: Run the test**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-identity-links.schema.test.ts`
Expected: PASS (4 tests). This test needs no database connection, only the schema module.

- [ ] **Step 7: Commit**

```bash
git add src/modules/krabiclaw-integration/database/schema src/schema/index.ts src/shared/database/migrations test/modules/krabiclaw-integration/krabiclaw-identity-links.schema.test.ts
git commit -m "feat(krabiclaw-integration): add identity link schema"
```

---

### Task 2: Organization link repository

**Files:**
- Create: `src/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository.ts`
- Test: `test/modules/krabiclaw-integration/krabiclaw-organization-links.repository.test.ts`

**Interfaces:**
- Consumes: `krabiclawOrganizationLinks`, `InsertKrabiClawOrganizationLink`, `SelectKrabiClawOrganizationLink` from Task 1.
- Produces: `krabiclawOrganizationLinksRepository = { findByExternalId, create }` — `findByExternalId(externalOrganizationId: string): Promise<SelectKrabiClawOrganizationLink | undefined>`, `create(data: InsertKrabiClawOrganizationLink): Promise<SelectKrabiClawOrganizationLink>` (idempotent: a second `create` call with the same `external_organization_id` returns the existing row instead of throwing). Consumed by Task 4 (resolver service).

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/krabiclaw-integration/krabiclaw-organization-links.repository.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { krabiclawOrganizationLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository';
import { authHelpers } from '@/test/helpers/auth';

const { createTestOrganization } = authHelpers;

describe('krabiclawOrganizationLinksRepository', () => {
  it('creates a new link and finds it by external id', async () => {
    const org = await createTestOrganization();
    const externalOrganizationId = randomUUID();

    const created = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: org.id,
    });

    expect(created.organization_id).toBe(org.id);

    const found = await krabiclawOrganizationLinksRepository.findByExternalId(externalOrganizationId);
    expect(found?.id).toBe(created.id);
  });

  it('returns the existing link when creating with the same external id again', async () => {
    const org = await createTestOrganization();
    const externalOrganizationId = randomUUID();

    const first = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: org.id,
    });
    const second = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: org.id,
    });

    expect(second.id).toBe(first.id);
  });

  it('rejects linking a second external organization to an already-linked local organization', async () => {
    const org = await createTestOrganization();

    await krabiclawOrganizationLinksRepository.create({
      external_organization_id: randomUUID(),
      organization_id: org.id,
    });

    await expect(
      krabiclawOrganizationLinksRepository.create({
        external_organization_id: randomUUID(),
        organization_id: org.id,
      })
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('returns undefined for an unknown external id', async () => {
    await expect(krabiclawOrganizationLinksRepository.findByExternalId(randomUUID())).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-organization-links.repository.test.ts`
Expected: FAIL — cannot find module `@/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository`.

- [ ] **Step 3: Write the repository**

```typescript
// src/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository.ts
import { eq } from 'drizzle-orm';

import {
  krabiclawOrganizationLinks,
  type InsertKrabiClawOrganizationLink,
  type SelectKrabiClawOrganizationLink,
} from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
import { getActiveTx } from '@/shared/database/uow';

const findByExternalId = async (
  externalOrganizationId: string
): Promise<SelectKrabiClawOrganizationLink | undefined> => {
  const [link] = await getActiveTx()
    .select()
    .from(krabiclawOrganizationLinks)
    .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId))
    .limit(1);
  return link;
};

const create = async (data: InsertKrabiClawOrganizationLink): Promise<SelectKrabiClawOrganizationLink> => {
  const [link] = await getActiveTx()
    .insert(krabiclawOrganizationLinks)
    .values(data)
    .onConflictDoNothing({ target: krabiclawOrganizationLinks.external_organization_id })
    .returning();
  if (link) {
    return link;
  }

  const existing = await findByExternalId(data.external_organization_id);
  if (!existing) {
    throw new Error('Failed to create krabiclaw organization link');
  }
  return existing;
};

export const krabiclawOrganizationLinksRepository = {
  findByExternalId,
  create,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-organization-links.repository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository.ts test/modules/krabiclaw-integration/krabiclaw-organization-links.repository.test.ts
git commit -m "feat(krabiclaw-integration): add organization link repository"
```

---

### Task 3: User link repository

**Files:**
- Create: `src/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository.ts`
- Test: `test/modules/krabiclaw-integration/krabiclaw-user-links.repository.test.ts`

**Interfaces:**
- Consumes: `krabiclawUserLinks`, `InsertKrabiClawUserLink`, `SelectKrabiClawUserLink` from Task 1.
- Produces: `krabiclawUserLinksRepository = { findByExternalId, create }` — same shape and idempotency contract as Task 2's repository, keyed on `external_user_id`/`user_id`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/krabiclaw-integration/krabiclaw-user-links.repository.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { krabiclawUserLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository';
import { authHelpers } from '@/test/helpers/auth';

const { createTestUser } = authHelpers;

describe('krabiclawUserLinksRepository', () => {
  it('creates a new link and finds it by external id', async () => {
    const user = await createTestUser();
    const externalUserId = randomUUID();

    const created = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: user.id,
    });

    expect(created.user_id).toBe(user.id);

    const found = await krabiclawUserLinksRepository.findByExternalId(externalUserId);
    expect(found?.id).toBe(created.id);
  });

  it('returns the existing link when creating with the same external id again', async () => {
    const user = await createTestUser();
    const externalUserId = randomUUID();

    const first = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: user.id,
    });
    const second = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: user.id,
    });

    expect(second.id).toBe(first.id);
  });

  it('rejects linking a second external user to an already-linked local user', async () => {
    const user = await createTestUser();

    await krabiclawUserLinksRepository.create({
      external_user_id: randomUUID(),
      user_id: user.id,
    });

    await expect(
      krabiclawUserLinksRepository.create({
        external_user_id: randomUUID(),
        user_id: user.id,
      })
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('returns undefined for an unknown external id', async () => {
    await expect(krabiclawUserLinksRepository.findByExternalId(randomUUID())).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-user-links.repository.test.ts`
Expected: FAIL — cannot find module `@/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository`.

- [ ] **Step 3: Write the repository**

```typescript
// src/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository.ts
import { eq } from 'drizzle-orm';

import {
  krabiclawUserLinks,
  type InsertKrabiClawUserLink,
  type SelectKrabiClawUserLink,
} from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';
import { getActiveTx } from '@/shared/database/uow';

const findByExternalId = async (externalUserId: string): Promise<SelectKrabiClawUserLink | undefined> => {
  const [link] = await getActiveTx()
    .select()
    .from(krabiclawUserLinks)
    .where(eq(krabiclawUserLinks.external_user_id, externalUserId))
    .limit(1);
  return link;
};

const create = async (data: InsertKrabiClawUserLink): Promise<SelectKrabiClawUserLink> => {
  const [link] = await getActiveTx()
    .insert(krabiclawUserLinks)
    .values(data)
    .onConflictDoNothing({ target: krabiclawUserLinks.external_user_id })
    .returning();
  if (link) {
    return link;
  }

  const existing = await findByExternalId(data.external_user_id);
  if (!existing) {
    throw new Error('Failed to create krabiclaw user link');
  }
  return existing;
};

export const krabiclawUserLinksRepository = {
  findByExternalId,
  create,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-user-links.repository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository.ts test/modules/krabiclaw-integration/krabiclaw-user-links.repository.test.ts
git commit -m "feat(krabiclaw-integration): add user link repository"
```

---

### Task 4: Identity resolver service

**Files:**
- Create: `src/modules/krabiclaw-integration/types/identity.types.ts`
- Create: `src/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service.ts`
- Test: `test/modules/krabiclaw-integration/krabiclaw-identity-resolver.service.test.ts`

**Interfaces:**
- Consumes: `krabiclawOrganizationLinksRepository` (Task 2), `krabiclawUserLinksRepository` (Task 3), `KrabiClawOrganizationDirectoryRecord`/`KrabiClawUserDirectoryRecord` from `@/modules/krabiclaw-integration/types/directory.types` (shipped in U2 — `{ id, name, slug }` and `{ id, name, email }` respectively), `organizations`/`users` from `@/schema/better-auth-schema`, `uow`/`getActiveTx` from `@/shared/database/uow`, `wrapDbError` from `@/shared/utils/db-error`.
- Produces: `KrabiClawActorKind = 'human' | 'anonymous'`, `KrabiClawResolvedIdentity = { organizationId: string; userId: string | null }`, and `krabiclawIdentityResolverService = { resolveOrganizationAnchor, resolveUserAnchor, resolveIdentity }` where:
  - `resolveOrganizationAnchor(externalOrganizationId: string, directory: KrabiClawOrganizationDirectoryRecord): Promise<string>` — returns the local `organizations.id`, creating an anchor row + link row on first call.
  - `resolveUserAnchor(externalUserId: string, directory: KrabiClawUserDirectoryRecord): Promise<string>` — returns the local `users.id`, creating an anchor row + link row on first call.
  - `resolveIdentity(params: { externalOrganizationId: string; organizationDirectory: KrabiClawOrganizationDirectoryRecord; actorKind: KrabiClawActorKind; externalUserId?: string; userDirectory?: KrabiClawUserDirectoryRecord }): Promise<KrabiClawResolvedIdentity>` — orchestrates both, skipping the user anchor entirely when `actorKind === 'anonymous'`.
  - This is what Task 4 in a later unit (U4, the trusted integration adapter) will call after verifying OAuth and parsing KrabiClaw's identity headers — not wired to any HTTP route in this unit.

- [ ] **Step 1: Write the identity types**

```typescript
// src/modules/krabiclaw-integration/types/identity.types.ts
export type KrabiClawActorKind = 'human' | 'anonymous';

export interface KrabiClawResolvedIdentity {
  organizationId: string;
  userId: string | null;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// test/modules/krabiclaw-integration/krabiclaw-identity-resolver.service.test.ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { krabiclawOrganizationLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
import { krabiclawUserLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb, getTestPool } from '@/test/helpers/db';

const { resolveOrganizationAnchor, resolveUserAnchor, resolveIdentity } = krabiclawIdentityResolverService;

const orgDirectory = (id: string) => ({ id, name: `Org ${id}`, slug: `org-${id}` });
const userDirectory = (id: string) => ({ id, name: `User ${id}`, email: `${id}@example.test` });

describe('krabiclawIdentityResolverService', () => {
  it('creates a new organization anchor on first resolution', async () => {
    const externalOrganizationId = randomUUID();

    const organizationId = await resolveOrganizationAnchor(
      externalOrganizationId,
      orgDirectory(externalOrganizationId)
    );

    const [link] = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(link?.organization_id).toBe(organizationId);
  });

  it('returns the same organization anchor on repeated resolution without creating a duplicate', async () => {
    const externalOrganizationId = randomUUID();
    const directory = orgDirectory(externalOrganizationId);

    const first = await resolveOrganizationAnchor(externalOrganizationId, directory);
    const second = await resolveOrganizationAnchor(externalOrganizationId, directory);

    expect(second).toBe(first);

    const links = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(links).toHaveLength(1);
  });

  it('resolves concurrent requests for the same external organization to one anchor', async () => {
    const externalOrganizationId = randomUUID();
    const directory = orgDirectory(externalOrganizationId);

    const [first, second] = await Promise.all([
      resolveOrganizationAnchor(externalOrganizationId, directory),
      resolveOrganizationAnchor(externalOrganizationId, directory),
    ]);

    expect(second).toBe(first);

    const links = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(links).toHaveLength(1);
  });

  it('rolls back the anchor organization when the advisory lock times out', async () => {
    const externalOrganizationId = randomUUID();
    const directory = orgDirectory(externalOrganizationId);
    const lockKey = `krabiclaw:org-link:${externalOrganizationId}`;

    const pool = getTestPool();
    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);

    try {
      await expect(resolveOrganizationAnchor(externalOrganizationId, directory)).rejects.toBeInstanceOf(
        HTTPException
      );
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    const links = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(links).toHaveLength(0);
  });

  it('creates a user anchor for a human actor', async () => {
    const externalUserId = randomUUID();

    const userId = await resolveUserAnchor(externalUserId, userDirectory(externalUserId));

    const [link] = await getTestDb()
      .select()
      .from(krabiclawUserLinks)
      .where(eq(krabiclawUserLinks.external_user_id, externalUserId));
    expect(link?.user_id).toBe(userId);
  });

  it('surfaces an email collision with an existing Blawby user as a conflict and creates no orphan link', async () => {
    const existingUser = await authHelpers.createTestUser();
    const externalUserId = randomUUID();

    await expect(
      resolveUserAnchor(externalUserId, { id: externalUserId, name: 'Collides', email: existingUser.email })
    ).rejects.toBeInstanceOf(HTTPException);

    const links = await getTestDb()
      .select()
      .from(krabiclawUserLinks)
      .where(eq(krabiclawUserLinks.external_user_id, externalUserId));
    expect(links).toHaveLength(0);
  });

  it('never creates a user anchor for an anonymous actor', async () => {
    const externalOrganizationId = randomUUID();

    const identity = await resolveIdentity({
      externalOrganizationId,
      organizationDirectory: orgDirectory(externalOrganizationId),
      actorKind: 'anonymous',
    });

    expect(identity.userId).toBeNull();
    expect(identity.organizationId).toBeTruthy();
  });

  it('resolves both anchors for a human actor', async () => {
    const externalOrganizationId = randomUUID();
    const externalUserId = randomUUID();

    const identity = await resolveIdentity({
      externalOrganizationId,
      organizationDirectory: orgDirectory(externalOrganizationId),
      actorKind: 'human',
      externalUserId,
      userDirectory: userDirectory(externalUserId),
    });

    expect(identity.organizationId).toBeTruthy();
    expect(identity.userId).toBeTruthy();
  });

  it('rejects a human actor request missing user identity', async () => {
    const externalOrganizationId = randomUUID();

    await expect(
      resolveIdentity({
        externalOrganizationId,
        organizationDirectory: orgDirectory(externalOrganizationId),
        actorKind: 'human',
      })
    ).rejects.toThrow('externalUserId and userDirectory are required to resolve a human actor');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-identity-resolver.service.test.ts`
Expected: FAIL — cannot find module `@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service`.

- [ ] **Step 4: Write the resolver service**

```typescript
// src/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service.ts
import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { krabiclawOrganizationLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository';
import { krabiclawUserLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository';
import type {
  KrabiClawOrganizationDirectoryRecord,
  KrabiClawUserDirectoryRecord,
} from '@/modules/krabiclaw-integration/types/directory.types';
import type { KrabiClawResolvedIdentity, KrabiClawActorKind } from '@/modules/krabiclaw-integration/types/identity.types';
import { organizations, users } from '@/schema/better-auth-schema';
import { getActiveTx, uow } from '@/shared/database/uow';
import { wrapDbError } from '@/shared/utils/db-error';

const logger = getLogger(['modules', 'krabiclaw-integration', 'identity-resolver']);

const LOCK_TIMEOUT = '2s';

const isLockTimeout = (error: unknown): boolean => {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
  return code === '55P03';
};

const withAnchorLock = async <T>(lockKey: string, execute: () => Promise<T>): Promise<T> => {
  try {
    return await uow.transaction(async () => {
      const trx = getActiveTx();
      await trx.execute(sql`SET LOCAL lock_timeout = ${LOCK_TIMEOUT}`);
      await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      return execute();
    });
  } catch (error) {
    if (isLockTimeout(error)) {
      logger.warn('krabiclaw identity anchor lock timed out: {lockKey}', { lockKey });
      throw new HTTPException(409, {
        message: 'Identity resolution timed out due to concurrent activity. Please retry.',
      });
    }
    return wrapDbError(error);
  }
};

const resolveOrganizationAnchor = async (
  externalOrganizationId: string,
  directory: KrabiClawOrganizationDirectoryRecord
): Promise<string> => {
  const existing = await krabiclawOrganizationLinksRepository.findByExternalId(externalOrganizationId);
  if (existing) {
    return existing.organization_id;
  }

  return withAnchorLock(`krabiclaw:org-link:${externalOrganizationId}`, async () => {
    const alreadyLinked = await krabiclawOrganizationLinksRepository.findByExternalId(externalOrganizationId);
    if (alreadyLinked) {
      return alreadyLinked.organization_id;
    }

    const [anchorOrganization] = await getActiveTx()
      .insert(organizations)
      .values({
        name: directory.name,
        slug: `krabiclaw-${externalOrganizationId}`,
        createdAt: new Date(),
      })
      .returning();

    const link = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: anchorOrganization.id,
    });

    return link.organization_id;
  });
};

const resolveUserAnchor = async (
  externalUserId: string,
  directory: KrabiClawUserDirectoryRecord
): Promise<string> => {
  const existing = await krabiclawUserLinksRepository.findByExternalId(externalUserId);
  if (existing) {
    return existing.user_id;
  }

  return withAnchorLock(`krabiclaw:user-link:${externalUserId}`, async () => {
    const alreadyLinked = await krabiclawUserLinksRepository.findByExternalId(externalUserId);
    if (alreadyLinked) {
      return alreadyLinked.user_id;
    }

    const [anchorUser] = await getActiveTx()
      .insert(users)
      .values({
        name: directory.name,
        email: directory.email,
      })
      .returning();

    const link = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: anchorUser.id,
    });

    return link.user_id;
  });
};

const resolveIdentity = async (params: {
  externalOrganizationId: string;
  organizationDirectory: KrabiClawOrganizationDirectoryRecord;
  actorKind: KrabiClawActorKind;
  externalUserId?: string;
  userDirectory?: KrabiClawUserDirectoryRecord;
}): Promise<KrabiClawResolvedIdentity> => {
  const organizationId = await resolveOrganizationAnchor(params.externalOrganizationId, params.organizationDirectory);

  if (params.actorKind === 'anonymous') {
    return { organizationId, userId: null };
  }

  if (!params.externalUserId || !params.userDirectory) {
    throw new Error('externalUserId and userDirectory are required to resolve a human actor');
  }

  const userId = await resolveUserAnchor(params.externalUserId, params.userDirectory);
  return { organizationId, userId };
};

export const krabiclawIdentityResolverService = {
  resolveOrganizationAnchor,
  resolveUserAnchor,
  resolveIdentity,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/krabiclaw-integration/krabiclaw-identity-resolver.service.test.ts`
Expected: PASS (9 tests). The lock-timeout test takes roughly 2 seconds (the `SET LOCAL lock_timeout = '2s'` wait) — this is expected, not a hang.

- [ ] **Step 6: Commit**

```bash
git add src/modules/krabiclaw-integration/types/identity.types.ts src/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service.ts test/modules/krabiclaw-integration/krabiclaw-identity-resolver.service.test.ts
git commit -m "feat(krabiclaw-integration): add identity resolver service"
```

---

### Task 5: Intake request-key persistence

**Files:**
- Modify: `src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema.ts`
- Modify: `src/modules/practice-client-intakes/database/queries/practice-client-intakes.repository.ts`
- Create (generated): a new migration via `pnpm run db:generate`
- Test: `test/modules/practice-client-intakes/krabiclaw-request-key.repository.test.ts`

**Interfaces:**
- Consumes: `practiceClientIntakes`, `InsertPracticeClientIntake`, `SelectPracticeClientIntake` (existing, being extended).
- Produces: a nullable `krabiclaw_request_key: uuid` column on `practice_client_intakes` with a partial unique index on `(organization_id, krabiclaw_request_key) WHERE krabiclaw_request_key IS NOT NULL`; two new repository functions added to `practiceClientIntakesRepository`: `findByKrabiClawRequestKey(organizationId: string, requestKey: string): Promise<SelectPracticeClientIntake | undefined>` and `createWithKrabiClawRequestKey(data: InsertPracticeClientIntake & { krabiclaw_request_key: string }): Promise<SelectPracticeClientIntake>` (idempotent create — a second call with the same `organization_id` + `krabiclaw_request_key` returns the first row instead of inserting a duplicate). Consumed by U6 (intake operation extraction), not wired into any route in this unit.

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/practice-client-intakes/krabiclaw-request-key.repository.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { InsertPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { authHelpers } from '@/test/helpers/auth';

const { createTestOrganization } = authHelpers;

const baseIntake = (organizationId: string, requestKey: string): InsertPracticeClientIntake & {
  krabiclaw_request_key: string;
} => ({
  organization_id: organizationId,
  amount: 1000,
  currency: 'usd',
  status: 'pending',
  triage_status: 'pending_review',
  krabiclaw_request_key: requestKey,
});

describe('practiceClientIntakesRepository krabiclaw request key', () => {
  it('creates a new intake for a fresh request key', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const created = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(org.id, requestKey)
    );

    expect(created.krabiclaw_request_key).toBe(requestKey);

    const found = await practiceClientIntakesRepository.findByKrabiClawRequestKey(org.id, requestKey);
    expect(found?.id).toBe(created.id);
  });

  it('replays the same intake when the same organization reuses a request key', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const first = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(baseIntake(org.id, requestKey));
    const second = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(org.id, requestKey)
    );

    expect(second.id).toBe(first.id);
  });

  it('does not leak an intake across organizations that happen to reuse the same request key', async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const requestKey = randomUUID();

    const intakeA = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(orgA.id, requestKey)
    );
    const intakeB = await practiceClientIntakesRepository.createWithKrabiClawRequestKey(
      baseIntake(orgB.id, requestKey)
    );

    expect(intakeB.id).not.toBe(intakeA.id);
    await expect(practiceClientIntakesRepository.findByKrabiClawRequestKey(orgB.id, requestKey)).resolves.toMatchObject(
      { id: intakeB.id }
    );
  });

  it('leaves regular intake creation without a request key unaffected', async () => {
    const org = await createTestOrganization();

    const created = await practiceClientIntakesRepository.create({
      organization_id: org.id,
      amount: 500,
      currency: 'usd',
      status: 'pending',
      triage_status: 'pending_review',
    });

    expect(created.krabiclaw_request_key).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/practice-client-intakes/krabiclaw-request-key.repository.test.ts`
Expected: FAIL — `practiceClientIntakesRepository.createWithKrabiClawRequestKey is not a function` (and the schema has no `krabiclaw_request_key` field yet, so `baseIntake`'s extra field would otherwise be a type error once the repository function exists — write the schema change first, per the next step, before re-running).

- [ ] **Step 3: Add the column and partial unique index to the schema**

In `src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema.ts`, update the pg-core import to include `uniqueIndex`:

```typescript
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
```

Add the new column right after the existing Stripe ID columns (after `stripe_checkout_session_id: text('stripe_checkout_session_id').unique(), // Created by Payment Link, populated via webhook`):

```typescript
    // KrabiClaw facade idempotency (nullable — only facade-created intakes set this)
    krabiclaw_request_key: uuid('krabiclaw_request_key'),
```

Add the partial unique index to the `(table) => [...]` array, alongside the existing indexes:

```typescript
    uniqueIndex('practice_client_intakes_krabiclaw_request_key_idx')
      .on(table.organization_id, table.krabiclaw_request_key)
      .where(sql`${table.krabiclaw_request_key} IS NOT NULL`),
```

- [ ] **Step 4: Regenerate the migration**

Run: `pnpm run db:generate`
Expected: a new `00NN_<slug>.sql` file under `src/shared/database/migrations/` containing `ALTER TABLE "practice_client_intakes" ADD COLUMN "krabiclaw_request_key" uuid;` and a `CREATE UNIQUE INDEX ... WHERE "krabiclaw_request_key" IS NOT NULL`. Inspect it to confirm both statements are present and no unrelated column is touched.

- [ ] **Step 5: Add the repository functions**

In `src/modules/practice-client-intakes/database/queries/practice-client-intakes.repository.ts`, add two new functions (place them near the existing `create` function) and add both to the exported `practiceClientIntakesRepository` object:

```typescript
const findByKrabiClawRequestKey = async (
  organizationId: string,
  requestKey: string
): Promise<SelectPracticeClientIntake | undefined> => {
  const [intake] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(
      and(
        eq(practiceClientIntakes.organization_id, organizationId),
        eq(practiceClientIntakes.krabiclaw_request_key, requestKey)
      )
    )
    .limit(1);
  return intake;
};

const createWithKrabiClawRequestKey = async (
  data: InsertPracticeClientIntake & { krabiclaw_request_key: string }
): Promise<SelectPracticeClientIntake> => {
  const [intake] = await getActiveTx()
    .insert(practiceClientIntakes)
    .values(data)
    .onConflictDoNothing({
      target: [practiceClientIntakes.organization_id, practiceClientIntakes.krabiclaw_request_key],
      where: sql`${practiceClientIntakes.krabiclaw_request_key} IS NOT NULL`,
    })
    .returning();
  if (intake) {
    return intake;
  }

  const existing = await findByKrabiClawRequestKey(data.organization_id, data.krabiclaw_request_key);
  if (!existing) {
    throw new Error('Failed to create idempotent krabiclaw intake');
  }
  return existing;
};
```

Update the exported object:

```typescript
export const practiceClientIntakesRepository = {
  create,
  findById,
  findByIdForUpdate,
  findByInvitationPrefillTokenHash,
  findByStripePaymentLinkId,
  findByStripePaymentIntentId,
  findByStripeCheckoutSessionId,
  findByKrabiClawRequestKey,
  createWithKrabiClawRequestKey,
  update,
  updateStatus,
  setInvitationPrefillToken,
  findByOrganizationId,
  getStats,
  requestEnrichment,
  claimEnrichment,
  completeEnrichment,
  failEnrichment,
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/practice-client-intakes/krabiclaw-request-key.repository.test.ts`
Expected: PASS (4 tests).

Run: `pnpm exec vitest run test/modules/practice-client-intakes/`
Expected: all existing practice-client-intakes tests still PASS (the new column is nullable and additive, so this is a regression check on the whole module).

- [ ] **Step 7: Commit**

```bash
git add src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema.ts src/modules/practice-client-intakes/database/queries/practice-client-intakes.repository.ts src/shared/database/migrations test/modules/practice-client-intakes/krabiclaw-request-key.repository.test.ts
git commit -m "feat(practice-client-intakes): add krabiclaw request-key idempotency"
```

---

### Task 6: Connect operation snapshots

**Files:**
- Create: `src/modules/onboarding/schemas/krabiclaw-connect-operations.schema.ts`
- Modify: `src/modules/onboarding/schemas/index.ts`
- Create: `src/modules/onboarding/database/queries/krabiclaw-connect-operations.repository.ts`
- Create (generated): a new migration via `pnpm run db:generate`
- Test: `test/modules/onboarding/krabiclaw-connect-operations.repository.test.ts`

**Interfaces:**
- Consumes: `organizations` from `@/schema/better-auth-schema`, `stripeConnectedAccounts` from `@/modules/onboarding/schemas/onboarding.schema`.
- Produces: `krabiclawConnectOperations` table (`id`, `organization_id`, `request_key`, `status: 'pending' | 'succeeded' | 'failed'`, `connected_account_id`, `error_message`, timestamps), `KRABICLAW_CONNECT_OPERATION_STATUSES`, `InsertKrabiClawConnectOperation`, `SelectKrabiClawConnectOperation`; `krabiclawConnectOperationsRepository = { findByRequestKey, createPending, markSucceeded, markFailed }` where `createPending` is idempotent per `(organization_id, request_key)`. Consumed by U5 (Connect operation extraction), not wired into any route in this unit.

This module uses the older `schemas/` (not `database/schema/`) convention throughout (`onboarding.schema.ts` lives at `src/modules/onboarding/schemas/`) — follow that existing convention for the new file rather than introducing a second, inconsistent layout inside the same module.

- [ ] **Step 1: Write the failing test**

```typescript
// test/modules/onboarding/krabiclaw-connect-operations.repository.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { krabiclawConnectOperationsRepository } from '@/modules/onboarding/database/queries/krabiclaw-connect-operations.repository';
import { authHelpers } from '@/test/helpers/auth';

const { createTestOrganization } = authHelpers;

describe('krabiclawConnectOperationsRepository', () => {
  it('creates a pending operation and finds it by request key', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const created = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });

    expect(created.status).toBe('pending');

    const found = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(found?.id).toBe(created.id);
  });

  it('recovers the same operation when the same request key is retried', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();

    const first = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });
    const second = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });

    expect(second.id).toBe(first.id);
  });

  it('marks an operation succeeded exactly once', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();
    const operation = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });

    const succeeded = await krabiclawConnectOperationsRepository.markSucceeded(operation.id, randomUUID());
    expect(succeeded.status).toBe('succeeded');

    await expect(krabiclawConnectOperationsRepository.markSucceeded(operation.id, randomUUID())).rejects.toThrow(
      'Connect operation is no longer pending'
    );
  });

  it('marks an operation failed exactly once', async () => {
    const org = await createTestOrganization();
    const requestKey = randomUUID();
    const operation = await krabiclawConnectOperationsRepository.createPending({
      organization_id: org.id,
      request_key: requestKey,
    });

    const failed = await krabiclawConnectOperationsRepository.markFailed(operation.id, 'stripe unavailable');
    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('stripe unavailable');

    await expect(krabiclawConnectOperationsRepository.markFailed(operation.id, 'stripe unavailable')).rejects.toThrow(
      'Connect operation is no longer pending'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/modules/onboarding/krabiclaw-connect-operations.repository.test.ts`
Expected: FAIL — cannot find module `@/modules/onboarding/database/queries/krabiclaw-connect-operations.repository`.

- [ ] **Step 3: Write the schema**

```typescript
// src/modules/onboarding/schemas/krabiclaw-connect-operations.schema.ts
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { organizations } from '@/schema/better-auth-schema';

export const KRABICLAW_CONNECT_OPERATION_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type KrabiClawConnectOperationStatus = (typeof KRABICLAW_CONNECT_OPERATION_STATUSES)[number];

export const krabiclawConnectOperations = pgTable(
  'krabiclaw_connect_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    request_key: uuid('request_key').notNull(),
    status: text('status').notNull().default('pending').$type<KrabiClawConnectOperationStatus>(),
    connected_account_id: uuid('connected_account_id').references(() => stripeConnectedAccounts.id, {
      onDelete: 'set null',
    }),
    error_message: text('error_message'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('krabiclaw_connect_operations_org_request_idx').on(table.organization_id, table.request_key),
    index('krabiclaw_connect_operations_status_idx').on(table.status),
    check(
      'krabiclaw_connect_operations_status_check',
      sql`${table.status} IN ('pending', 'succeeded', 'failed')`
    ),
  ]
);

export type InsertKrabiClawConnectOperation = typeof krabiclawConnectOperations.$inferInsert;
export type SelectKrabiClawConnectOperation = typeof krabiclawConnectOperations.$inferSelect;
```

- [ ] **Step 4: Add it to the onboarding schema barrel**

```typescript
// src/modules/onboarding/schemas/index.ts
export * from '@/modules/onboarding/schemas/onboarding.schema';
export * from '@/modules/onboarding/schemas/krabiclaw-connect-operations.schema';
```

- [ ] **Step 5: Regenerate the aggregated schema barrel and the migration**

Run: `pnpm run sync:schemas`
Expected: `src/schema/index.ts` gains an export line for `krabiclaw-connect-operations.schema`.

Run: `pnpm run db:generate`
Expected: a new `00NN_<slug>.sql` file containing `CREATE TABLE "krabiclaw_connect_operations" ...` with the unique index, the status index, the check constraint, and both foreign keys (`organization_id` cascade, `connected_account_id` set null). Inspect it before continuing.

- [ ] **Step 6: Write the repository**

```typescript
// src/modules/onboarding/database/queries/krabiclaw-connect-operations.repository.ts
import { and, eq } from 'drizzle-orm';

import {
  krabiclawConnectOperations,
  type InsertKrabiClawConnectOperation,
  type SelectKrabiClawConnectOperation,
} from '@/modules/onboarding/schemas/krabiclaw-connect-operations.schema';
import { getActiveTx } from '@/shared/database/uow';

const findByRequestKey = async (
  organizationId: string,
  requestKey: string
): Promise<SelectKrabiClawConnectOperation | undefined> => {
  const [operation] = await getActiveTx()
    .select()
    .from(krabiclawConnectOperations)
    .where(
      and(
        eq(krabiclawConnectOperations.organization_id, organizationId),
        eq(krabiclawConnectOperations.request_key, requestKey)
      )
    )
    .limit(1);
  return operation;
};

const createPending = async (
  data: Pick<InsertKrabiClawConnectOperation, 'organization_id' | 'request_key'>
): Promise<SelectKrabiClawConnectOperation> => {
  const [operation] = await getActiveTx()
    .insert(krabiclawConnectOperations)
    .values(data)
    .onConflictDoNothing({
      target: [krabiclawConnectOperations.organization_id, krabiclawConnectOperations.request_key],
    })
    .returning();
  if (operation) {
    return operation;
  }

  const existing = await findByRequestKey(data.organization_id, data.request_key);
  if (!existing) {
    throw new Error('Failed to create krabiclaw connect operation');
  }
  return existing;
};

const markSucceeded = async (id: string, connectedAccountId: string): Promise<SelectKrabiClawConnectOperation> => {
  const [operation] = await getActiveTx()
    .update(krabiclawConnectOperations)
    .set({ status: 'succeeded', connected_account_id: connectedAccountId, error_message: null })
    .where(and(eq(krabiclawConnectOperations.id, id), eq(krabiclawConnectOperations.status, 'pending')))
    .returning();
  if (!operation) {
    throw new Error('Connect operation is no longer pending');
  }
  return operation;
};

const markFailed = async (id: string, errorMessage: string): Promise<SelectKrabiClawConnectOperation> => {
  const [operation] = await getActiveTx()
    .update(krabiclawConnectOperations)
    .set({ status: 'failed', error_message: errorMessage })
    .where(and(eq(krabiclawConnectOperations.id, id), eq(krabiclawConnectOperations.status, 'pending')))
    .returning();
  if (!operation) {
    throw new Error('Connect operation is no longer pending');
  }
  return operation;
};

export const krabiclawConnectOperationsRepository = {
  findByRequestKey,
  createPending,
  markSucceeded,
  markFailed,
};
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm exec vitest run test/modules/onboarding/krabiclaw-connect-operations.repository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add src/modules/onboarding/schemas src/modules/onboarding/database/queries/krabiclaw-connect-operations.repository.ts src/schema/index.ts src/shared/database/migrations test/modules/onboarding/krabiclaw-connect-operations.repository.test.ts
git commit -m "feat(onboarding): add krabiclaw connect operation snapshots"
```

---

### Task 7: Full verification and PR

**Files:** none (verification only).

**Interfaces:** none — this task runs the repo's standard validation suite and opens the PR.

- [ ] **Step 1: Run the full validation suite**

```bash
pnpm run typecheck
pnpm run format:check
pnpm run lint
pnpm run test
pnpm run build
```

Expected: all commands exit 0. If `format:check` or `lint` fail on generated migration SQL/JSON, do not hand-edit them — only fix the hand-written `.ts` files and regenerate if a schema definition needs to change.

- [ ] **Step 2: Review the full diff for scope**

Run: `git diff feat/krabiclaw-u2-directory-adapter...HEAD --stat`
Expected: only the files listed in Tasks 1–6 (schema, queries, services, types, migrations, tests) plus `src/schema/index.ts` and the two `schemas/index.ts` / `database/schema/index.ts` barrels. No route, `http.ts`, `handlers.ts`, or CASL file should appear — this unit has no HTTP surface.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/krabiclaw-u3-identity-links
gh pr create --base feat/krabiclaw-u2-directory-adapter --title "feat(krabiclaw-integration): add identity links and recovery records" --body "$(cat <<'EOF'
## Summary
- Add integration-owned identity link tables (`krabiclaw_organization_links`, `krabiclaw_user_links`) mapping external KrabiClaw IDs to minimal local UUID anchors, created race-safely under a Postgres advisory lock.
- Add a durable KrabiClaw request-key column + idempotent create path to `practice_client_intakes` so a lost response cannot duplicate an intake (R37).
- Add a `krabiclaw_connect_operations` snapshot table in the onboarding module so a retried Connect account creation can recover instead of duplicating (R42).
- No HTTP routes, D1 access, or Stripe calls in this unit — pure schema/repository/resolver scaffolding for U4 (trusted integration adapter) and U5/U6 to consume.

Implements U3 of `docs/plans/2026-08-08-001-feat-krabiclaw-legal-facade-plan.md` (R9, R12, R24, R37, R42; KTD5). Stacked on #418 and #419.

## Test plan
- [x] `pnpm run typecheck`
- [x] `pnpm run format:check`
- [x] `pnpm run lint`
- [x] `pnpm run test`
- [x] `pnpm run build`
- [x] Real-Postgres tests cover: first/repeated/concurrent org+user anchor resolution, reverse-collision rejection, advisory-lock-timeout rollback, anonymous actors never getting a user anchor, an email-collision-with-existing-user conflict, same-key intake replay, cross-tenant request-key isolation, and Connect operation recovery.
EOF
)"
```

Expected: PR opens targeting `feat/krabiclaw-u2-directory-adapter` (both #418 and #419 are still open at time of writing — re-check `gh pr view 418`/`gh pr view 419` before this step in case they merged during implementation, and target `staging` instead if so).

- [ ] **Step 4: Update memory**

After the PR is open, update `project_krabiclaw_legal_facade_progress.md` in the auto-memory folder: mark U3 done with its PR number/branch, and note U4 (trusted integration adapter) is next.
