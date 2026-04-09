# API Test Suite Design

**Date:** 2026-04-03  
**Status:** Approved

---

## Goals

1. Test every API endpoint for correct behavior (happy path)
2. Verify authorization boundaries: role hierarchy (owner/admin/member) + cross-org isolation
3. Test stateful business flows end-to-end (invoice lifecycle, matter billing, subscription, intake-to-client)
4. Cover all CASL `throwUnlessCan` checks via real HTTP through the full middleware stack

**Out of scope:** Testing Better Auth itself. We test that our routes enforce auth, not that Better Auth works.

---

## Test Stack

- **Runner:** Vitest
- **HTTP:** Supertest against the full `hono-app.ts` (real middleware stack, not module-level mounting)
- **Database:** Real PostgreSQL (`blawby_test`) — dropped and recreated on each run
- **External services:** Mocked via `vi.mock` (Stripe, S3, email, Graphile Worker events)
- **Exception:** Stripe webhook `constructEvent` signature verification is tested with real test payloads + secret

---

## File Structure

```text
test/
  helpers/
    app.ts               ← Hono app instance (existing)
    auth.ts              ← Better Auth test helpers (existing)
    db.ts                ← Test DB connection (existing)
    request.ts           ← Supertest helpers (existing)
    response.ts          ← Response type helpers (existing)
    context.ts           ← NEW: createFullTestContext()
  setup/
    globalSetup.ts       ← Drop/recreate blawby_test DB, run migrations (existing)
    globalTeardown.ts    ← Drop blawby_test DB (existing)
    setupFiles.ts        ← Load .env.test (existing)
  modules/
    practice/
      crud.test.ts
      authorization/
        practice.auth.test.ts
        members.auth.test.ts
    clients/
      crud.test.ts
      authorization/
        clients.auth.test.ts
        client-memos.auth.test.ts
    matters/
      crud.test.ts
      authorization/
        matters.auth.test.ts
        notes.auth.test.ts
        time-entries.auth.test.ts
        expenses.auth.test.ts
    invoices/
      crud.test.ts
      flow.test.ts                      ← invoice lifecycle (self-contained)
      authorization/
        invoices.auth.test.ts
        refund-requests.auth.test.ts
    subscriptions/
      crud.test.ts
      authorization/
        subscriptions.auth.test.ts
    trust/
      crud.test.ts
      authorization/
        trust.auth.test.ts
    uploads/
      crud.test.ts
      authorization/
        uploads.auth.test.ts
    preferences/
      crud.test.ts
      authorization/
        preferences.auth.test.ts
    practice-client-intakes/
      intakes.test.ts                   ← existing (happy path + basic 401s)
      authorization/
        intakes.auth.test.ts            ← NEW: role × endpoint matrix
    webhooks/
      stripe.test.ts                    ← signature verification + handler logic
  flows/
    intake-to-client.flow.test.ts       ← submit → triage → convert → verify client+matter in DB
    matter-billing.flow.test.ts         ← open matter → log time → create invoice → collect
    subscription-lifecycle.flow.test.ts ← subscribe → invoice generated → payment fails → cancel
```

---

## New Helper: `test/helpers/context.ts`

Every `authorization.test.ts` needs 4 actors. This helper creates them once:

```typescript
// Creates owner + admin + member in orgA, plus an outsider in orgB
export async function createFullTestContext() {
  const [ownerCtx, adminCtx, memberCtx, outsiderCtx] = await Promise.all([
    authHelpers.createTestContext('owner'),
    authHelpers.createTestContext('admin'),
    authHelpers.createTestContext('member'),
    authHelpers.createTestContext('owner'), // valid user, different org
  ]);

  return {
    org: ownerCtx.org, // orgA — the org under test
    owner: ownerCtx,
    admin: { ...adminCtx, org: ownerCtx.org }, // admin of orgA
    member: { ...memberCtx, org: ownerCtx.org }, // member of orgA
    outsider: outsiderCtx, // owner of orgB — cross-org isolation
  };
}
```

> **Implementation note:** `authHelpers.createTestContext` currently creates a new org per call. `createFullTestContext` must instead: (1) create one org, (2) create 3 users, (3) call `authHelpers.addUserToOrganization` to add admin + member to that same org, (4) generate session tokens for each via `betterAuth.api.getSession`. The outsider is created via a separate `authHelpers.createTestContext('owner')` call which correctly gets its own org.

---

## Authorization Test Pattern

Every `authorization.test.ts` follows this structure:

```typescript
describe('Invoices — Authorization', () => {
  let ctx: Awaited<ReturnType<typeof createFullTestContext>>;
  let invoiceId: string;

  beforeAll(async () => {
    ctx = await createFullTestContext();
    // Seed one resource in ctx.org for GET/PUT/DELETE tests
    const res = await authenticatedRequest(ctx.owner.sessionToken)
      .post(`/api/invoices`)
      .send({ practice_id: ctx.org.id, ... })
      .expect(201);
    invoiceId = res.body.id;
  });

  describe('DELETE /api/invoices/:id', () => {
    it('owner can delete',       () => authenticatedRequest(ctx.owner.sessionToken).delete(`/api/invoices/${invoiceId}`).expect(200));
    it('admin cannot delete',    () => authenticatedRequest(ctx.admin.sessionToken).delete(`/api/invoices/${invoiceId}`).expect(403));
    it('member cannot delete',   () => authenticatedRequest(ctx.member.sessionToken).delete(`/api/invoices/${invoiceId}`).expect(403));
    it('outsider cannot delete', () =>
      authenticatedRequest(ctx.outsider.sessionToken)
        .delete(`/api/invoices/${invoiceId}`)
        .expect((res) => { if (![403, 404].includes(res.status)) throw new Error(`expected 403 or 404, got ${res.status}`); })
    );
    it('unauthenticated cannot delete', () => request.delete(`/api/invoices/${invoiceId}`).expect(401));
  });
});
```

**Rules:**

- `beforeAll` seeds the minimum data needed — no re-seeding per test
- One `describe` block per endpoint group (e.g. all invoice CRUD, then refund requests separately)
- Files stay focused: if a module has sub-resources (notes, time entries, expenses), each gets its own `*.auth.test.ts`
- Expected statuses: `401` for unauthenticated, `403` for wrong role, `404` is acceptable for cross-org (resource not found is also safe)

---

## CRUD Test Pattern

`crud.test.ts` covers happy-path as owner. No role permutations — that's for `authorization/`:

```typescript
describe('Invoices — CRUD', () => {
  let ctx: { org: TestOrganization; sessionToken: string };
  let invoiceId: string;

  beforeAll(async () => {
    ctx = await authHelpers.createTestContext('owner');
  });

  it('POST /api/invoices creates a draft invoice', async () => {
    const res = await authenticatedRequest(ctx.sessionToken)
      .post('/api/invoices')
      .send({ practice_id: ctx.org.id, ... })
      .expect(201);
    invoiceId = res.body.id;
    expect(res.body.status).toBe('draft');
  });

  it('GET /api/invoices lists invoices', async () => { ... });
  it('GET /api/invoices/:id returns invoice', async () => { ... });
  it('PATCH /api/invoices/:id updates invoice', async () => { ... });
  it('DELETE /api/invoices/:id deletes invoice', async () => { ... });
});
```

---

## Flow Test Pattern

Flow tests narrate a real business scenario. State threads through the test via shared variables:

```typescript
// invoices/flow.test.ts
describe('Invoice Lifecycle Flow', () => {
  let ctx: { org: TestOrganization; sessionToken: string };
  let invoiceId: string;

  beforeAll(async () => {
    ctx = await authHelpers.createTestContext('owner');
  });

  it('1. creates a draft invoice', async () => {
    const res = await authenticatedRequest(ctx.sessionToken)
      .post('/api/invoices')
      .send({ ... })
      .expect(201);
    invoiceId = res.body.id;
    expect(res.body.status).toBe('draft');
  });

  it('2. sends the invoice to the client', async () => {
    await authenticatedRequest(ctx.sessionToken)
      .post(`/api/invoices/${invoiceId}/send`)
      .expect(200);
    // Verify status changed
    const res = await authenticatedRequest(ctx.sessionToken).get(`/api/invoices/${invoiceId}`).expect(200);
    expect(res.body.status).toBe('sent');
  });

  it('3. voids the invoice', async () => {
    await authenticatedRequest(ctx.sessionToken)
      .post(`/api/invoices/${invoiceId}/void`)
      .expect(200);
    const res = await authenticatedRequest(ctx.sessionToken).get(`/api/invoices/${invoiceId}`).expect(200);
    expect(res.body.status).toBe('voided');
  });
});
```

**Rules:**

- Tests are ordered and intentionally stateful within the file (each step depends on prior state)
- `describe` block name describes the narrative, `it` names are numbered steps
- Mocks (Stripe, email) reset between flow steps via `afterEach(() => vi.clearAllMocks())`
- If a flow spans multiple modules, it goes in `test/flows/` not inside a module folder

---

## Mocking Strategy

All external services are mocked. Add to each test file that touches them:

```typescript
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    invoices: { create: vi.fn(), finalize: vi.fn(), sendInvoice: vi.fn(), voidInvoice: vi.fn() },
    customers: { create: vi.fn().mockResolvedValue({ id: 'cus_test_mock' }) },
    subscriptions: { cancel: vi.fn() },
  },
}));

vi.mock('@/shared/events/definitions', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual }; // keep event classes, they just won't trigger workers
});
```

S3 (uploads module) is mocked via `vi.mock('@aws-sdk/client-s3', ...)`.

**Exception — webhooks:** `stripe.webhooks.constructEvent` is called with a real test payload signed with `STRIPE_WEBHOOK_SECRET` from `.env.test`. The downstream Stripe API calls (refunds, etc.) are still mocked.

---

## Module Priority & Build Order

Tests are written in this order so that later tests can reuse factories from earlier ones:

| #   | Module                    | Test files                                                       |
| --- | ------------------------- | ---------------------------------------------------------------- |
| 1   | `practice`                | crud, members.auth, practice.auth                                |
| 2   | `clients`                 | crud, clients.auth, client-memos.auth                            |
| 3   | `matters`                 | crud, matters.auth, notes.auth, time-entries.auth, expenses.auth |
| 4   | `invoices`                | crud, flow, invoices.auth, refund-requests.auth                  |
| 5   | `subscriptions`           | crud, subscriptions.auth                                         |
| 6   | `trust`                   | crud, trust.auth                                                 |
| 7   | `uploads`                 | crud, uploads.auth                                               |
| 8   | `preferences`             | crud, preferences.auth                                           |
| 9   | `practice-client-intakes` | intakes.auth (crud already exists)                               |
| 10  | `webhooks`                | stripe.test                                                      |
| 11  | `flows/`                  | intake-to-client, matter-billing, subscription-lifecycle         |

---

## File Length Rule

- If a test file exceeds ~150 lines, split it
- Authorization files: one file per sub-resource (notes, time entries, expenses get their own files)
- Flow files: one flow per file, even if flows are related
- No hard limit enforced by tooling — use judgment

---

## CI

To be determined. Options evaluated:

- GitHub Actions self-hosted runner (no minutes quota)
- Cloudflare Containers (beta) hosting the runner

Test suite itself is CI-agnostic — runs with `pnpm test` in any Node.js environment with PostgreSQL available.

---

## Roles Reference

```typescript
enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  ATTORNEY = 'attorney', // admin-level
  MEMBER = 'member',
  PARALEGAL = 'paralegal', // member-level
  CLIENT = 'client',
}
```

Authorization tests use `owner`, `admin`, `member` as the three representative roles + `outsider` for cross-org.
