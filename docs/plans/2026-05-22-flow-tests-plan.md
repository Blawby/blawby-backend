# Plan: Flow Tests (intake-to-client + intake-to-contract)

**Origin:** docs/brainstorms/2026-05-22-test-suite-practices-contracts-intakes-requirements.md
**Files to create:**
- `test/flows/intake-to-client.test.ts`
- `test/flows/intake-to-contract.test.ts`

## Key technical decisions

- Both flow tests use the **full app** (`app` from `test/helpers/app.ts`) — exercises real middleware chain.
- `convert` endpoint returns `{ matter_id, matter }` — NOT a client record. Client is created asynchronously via the `IntakeTriaged` event. Flow tests assert the matter, not the client.
- Engagement contract create requires `intake_id` (UUID). The intake UUID from seed step is passed directly.
- Intake must be in `status: 'succeeded'` + `triage_status: 'accepted'` before convert works.
- Use `createTestIntake` from `test/modules/practice-client-intakes/helpers/intake.ts` to seed a pre-succeeded intake directly into the DB.
- `seedPublicIntakeOrganization` (from the same helper) is required to satisfy Stripe connected account FK constraints when the org is looked up during intake operations.
- Both flow test files are independently runnable — no shared state between files.

## Mocks (file-top, hoisted — both files)

```typescript
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    customers: { create: vi.fn().mockResolvedValue({ id: 'cus_test_mock' }) },
    paymentLinks: { create: vi.fn() },
  },
  getStripeInstance: () => ({ ... }),  // same shape
}));

vi.mock('@/modules/engagement-contracts/services/engagement-contract-pdf.service', () => ({
  engagementContractPdfService: {
    generatePdfBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
    uploadPdfToR2: vi.fn().mockResolvedValue('contracts/test/mock.pdf'),
  },
}));

vi.mock('@/shared/services/email/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue({ id: 'mock-email-id' }) },
}));
```

---

## Plan A: `test/flows/intake-to-client.test.ts`

Verifies intake → accept → convert → matter created.

### Setup

```typescript
import { app } from '@/test/helpers/app';
import { authHelpers } from '@/test/helpers/auth';
import { createAuthenticatedRequest } from '@/test/helpers/request';
import { createTestIntake, seedPublicIntakeOrganization } from '@/test/modules/practice-client-intakes/helpers/intake';
import { getTestDb } from '@/test/helpers/db';

let sessionToken: string;
let orgId: string;
let intakeId: string;

beforeAll(async () => {
  const ctx = await authHelpers.createTestContext('owner');
  sessionToken = ctx.sessionToken;
  orgId = ctx.org.id;

  // Required: seed Stripe connected account + subscription for this org
  await seedPublicIntakeOrganization(orgId);

  // Seed intake already in succeeded state — skips payment flow
  const intake = await createTestIntake(orgId, {
    status: 'succeeded',
    triage_status: 'pending_review',
    metadata: { email: 'flow-test@test-blawby.com', name: 'Flow Test User' },
  });
  intakeId = intake.id;
});
```

### Steps

| Step | Action | HTTP | Body / Params | Assert |
|---|---|---|---|---|
| 1 | Accept intake | `PATCH /api/practice-client-intakes/{intakeId}/status` | `{ status: 'accepted' }` | 200, `triage_status: 'accepted'` |
| 2 | Convert intake | `PATCH /api/practice-client-intakes/{intakeId}/convert` | `{}` (or matter fields) | 201, body has `matter_id` (UUID), body has `matter` object |
| 3 | Assert matter fields | (from step 2 response) | — | `matter.organization_id === orgId`, `matter.intake_id === intakeId` |
| 4 | Assert intake converted | `GET /api/practice-client-intakes/{orgId}/{intakeId}` | — | 200, `status: 'converted'` |

**Note on step 1:** `PATCH /{uuid}/status` with body `{ status: 'accepted' }` maps to triage acceptance. Check existing `intakes.test.ts` line ~389 for exact request format — the status value may be `'accepted'` on the body directly or via an `action` field. Verify against `updateIntakeTriageStatusSchema` in the validation file.

---

## Plan B: `test/flows/intake-to-contract.test.ts`

Verifies intake → accept → convert → create contract → send → accept.

### Setup

Independent from Plan A — seeds its own org, intake. Does NOT import or depend on Plan A's state.

```typescript
let sessionToken: string;
let orgId: string;
let intakeId: string;
let contractId: string;

beforeAll(async () => {
  const ctx = await authHelpers.createTestContext('owner');
  sessionToken = ctx.sessionToken;
  orgId = ctx.org.id;

  await seedPublicIntakeOrganization(orgId);

  const intake = await createTestIntake(orgId, {
    status: 'succeeded',
    triage_status: 'pending_review',
    metadata: { email: 'contract-flow@test-blawby.com', name: 'Contract Flow User' },
  });
  intakeId = intake.id;
});
```

### Steps

| Step | Action | HTTP | Body | Assert |
|---|---|---|---|---|
| 1 | Accept intake | `PATCH /api/practice-client-intakes/{intakeId}/status` | `{ status: 'accepted' }` | 200, `triage_status: 'accepted'` |
| 2 | Convert intake | `PATCH /api/practice-client-intakes/{intakeId}/convert` | `{}` | 201, body has `matter_id` |
| 3 | Create engagement contract | `POST /api/engagement-contracts/{orgId}` | `{ intake_id: intakeId, contract_body: 'Test contract.' }` | 201, `status: 'draft'`, save `contractId` |
| 4 | Send contract | `PATCH /api/engagement-contracts/{orgId}/{contractId}/status` | `{ status: 'sent' }` | 200, `status: 'sent'` |
| 5 | Accept contract | `PATCH /api/engagement-contracts/{orgId}/{contractId}/status` | `{ status: 'accepted' }` | 200, `status: 'accepted'` |
| 6 | Assert final state | (from step 5 response) | — | `contract.intake_id === intakeId`, `contract.status === 'accepted'`, `contract.signed_pdf_s3_key` is non-null string |

**Note on step 3:** `contract_body` must be non-empty for the `draft → sent` transition to succeed (validated server-side). Set it at create time.

**Note on step 5:** `sent → accepted` triggers `generatePdfBuffer` + `uploadPdfToR2` — both are mocked above. Also triggers email — mocked above.

---

## Verification

- `pnpm test test/flows/intake-to-client.test.ts` passes
- `pnpm test test/flows/intake-to-contract.test.ts` passes
- Each file is independently runnable (no cross-file state)
- `pnpm run typecheck` passes
