# Plan: engagement-contracts.test.ts

**Origin:** docs/brainstorms/2026-05-22-test-suite-practices-contracts-intakes-requirements.md
**File to create:** `test/modules/engagement-contracts/engagement-contracts.test.ts`

## Key technical decisions

- Mount `engagementContractsApp` (from `src/modules/engagement-contracts/http.ts`) isolated.
- Module applies only `injectAbility()` — auth middleware absent. Must wrap manually (same pattern as intakes.test.ts).
- All staff routes: `requireAuth + requireOrgMembership`. Client routes (`GET /:id`, `PATCH /:id/accept`, `PATCH /:id/decline`) use `requireAuth` only — covered by the routes.config but out of scope for this plan.
- Must mock: Stripe (not triggered here), **Email**, **PDF** (both methods).
- Create requires `intake_id` (UUID). Must seed an intake first via the intakes module or DB helper.

## Mocks (file-top, hoisted)

```typescript
vi.mock('@/shared/services/email/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue({ id: 'mock-email-id' }) },
}));

vi.mock('@/modules/engagement-contracts/services/engagement-contract-pdf.service', () => ({
  engagementContractPdfService: {
    generatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
    uploadPdfToR2: vi.fn().mockResolvedValue('contracts/test/mock.pdf'),
  },
}));
```

Both `generatePdfBuffer` and `uploadPdfToR2` must be mocked — the `sent → accepted` transition calls both before committing.

## App wiring

```typescript
import { Hono } from 'hono';
import engagementContractsApp from '@/modules/engagement-contracts/http';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createRequest, createAuthenticatedRequest } from '@/test/helpers/request';

const orgApp = new Hono();
orgApp.use('/api/*', requireAuth());
orgApp.use('/api/*', requireOrgMembership());
orgApp.route('/api/engagement-contracts', engagementContractsApp);

const publicApp = new Hono();
publicApp.route('/api/engagement-contracts', engagementContractsApp);
```

## Seeding an intake

Engagement contracts require an existing intake via `intake_id`. Seed one by calling the intakes public route `POST /api/practice-client-intakes/create` using the org's slug, OR insert directly via `getTestDb()` if simpler. Recommended: use `getTestDb()` to insert a minimal intake row directly — avoids coupling this test file to the intakes HTTP layer.

## Test scenarios

### Setup
```typescript
let sessionToken: string;
let orgId: string;
let intakeId: string;
let contractId: string;

beforeAll(async () => {
  const ctx = await authHelpers.createTestContext('owner');
  sessionToken = ctx.sessionToken;
  orgId = ctx.org.id;
  // seed intake directly via DB
  const db = getTestDb();
  const [intake] = await db.insert(practiceClientIntakes).values({ organization_id: orgId, ... }).returning();
  intakeId = intake.id;
});
```

### Scenarios

| # | Scenario | Method + Path | Body | Expected |
|---|---|---|---|---|
| 1 | Create draft contract | `POST /api/engagement-contracts/{orgId}` | `{ intake_id: intakeId }` | 201, `status: 'draft'` |
| 2 | List contracts | `GET /api/engagement-contracts/{orgId}` | — | 200, `{ data: [...] }`, array contains contract |
| 3 | Get contract | `GET /api/engagement-contracts/{orgId}/{contractId}` | — | 200, contract record |
| 4 | Update draft | `PATCH /api/engagement-contracts/{orgId}/{contractId}` | `{ engagement_notes: 'test' }` | 200, `engagement_notes` updated |
| 5 | Transition draft → sent | `PATCH /api/engagement-contracts/{orgId}/{contractId}/status` | `{ status: 'sent' }` | 200, `status: 'sent'` |
| 6 | Transition sent → accepted | `PATCH /api/engagement-contracts/{orgId}/{contractId}/status` | `{ status: 'accepted' }` | 200, `status: 'accepted'` |
| 7 | Transition invalid (accepted → sent) | `PATCH /api/engagement-contracts/{orgId}/{contractId}/status` | `{ status: 'sent' }` | 422 |
| 8 | Create second contract for decline path | `POST /api/engagement-contracts/{orgId}` | `{ intake_id: intakeId2 }` | 201 |
| 9 | Transition sent → declined | `PATCH status` on second contract | `{ status: 'declined' }` | 200, `status: 'declined'` |
| 10 | POST — unauthenticated | no cookie | `POST /api/engagement-contracts/{orgId}` | 401 |
| 11 | POST — wrong org | second org session | `POST /api/engagement-contracts/{orgId}` | 403 |
| 12 | GET — not found | owner session | `GET /api/engagement-contracts/{orgId}/{randomUUID}` | 404 |

**Note on scenario ordering:** Run lifecycle in sequence (1→5→6→7) in a single `describe` block to maintain state. Use a second intake/contract for the decline path (scenario 8→9) to avoid state conflict with the accepted contract.

**Note on scenario 5 → 6:** The draft→sent transition requires `contract_body` to be non-empty (per route validation). Either set it in the create body or in the update step before transitioning.

## Verification

- `pnpm test test/modules/engagement-contracts/engagement-contracts.test.ts` passes
- `pnpm run typecheck` passes
- No real email or PDF calls fired (vi mocks capture them)
