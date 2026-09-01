import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp from '@/modules/krabiclaw-integration/http';
import { authHelpers } from '@/test/helpers/auth';
import type { TestOrganization } from '@/test/types/shared';
import type { config } from '@/shared/config';
import type { IntakePaymentCreated } from '@/shared/events/definitions/payments';
import type { IntakeSubmitted } from '@/shared/events/definitions/intakes';

/**
 * Task review Important #4: `intakes.contract.test.ts` mocks every domain
 * operation at its own module boundary, which proves facade wiring and
 * error-folding but would stay green even if U1's real organization-scoping
 * regressed. This file exercises the REAL create-intake / recovery-by-
 * reference / status operations end to end through the production
 * `krabiclawIntegrationApp` against genuinely seeded rows in the test
 * database (the same `authHelpers.createTestOrganization()` pattern used by
 * `get-intake-by-request-reference.operation.test.ts`) — only the
 * KrabiClaw-side policy boundary (machine-token verification, D1 directory
 * lookups, identity resolution, rate limiting) and the Stripe client are
 * mocked; every `practice-client-intakes` operation runs unmocked.
 */

const configState = vi.hoisted(() => ({
  facadeEnabled: true,
  rolloutGroups: {
    'practice-read': true,
    'practice-mutation': true,
    connect: true,
    'intake-without-payment': true,
    'intake-payment': true,
    engagement: true,
  },
}));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<{ config: typeof config }>();
  return {
    config: {
      ...actual.config,
      krabiclaw: {
        ...actual.config.krabiclaw,
        get facadeEnabled() {
          return configState.facadeEnabled;
        },
        get rolloutGroups() {
          return configState.rolloutGroups;
        },
      },
    },
  };
});

const INTAKE_TOKEN = 'intake-scoped-token';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', async () => {
  const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
  return {
    verifyFacadeToken: vi.fn(async (token: string | undefined) => {
      if (token === 'intake-scoped-token') {
        return { clientId: 'fixed-client', grantedScopes: new Set(['legal:intakes']) };
      }
      throw new KrabiClawMachineAuthError('Invalid access token');
    }),
  };
});

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-directory.service', () => ({
  krabiclawDirectoryService: {
    getOrganizationDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Test Org', slug: 'test-org' })),
    getUserDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Test User', email: 'test@example.test' })),
  },
}));

interface IdentityTestState {
  orgIdByExternalId: Record<string, string>;
}

/** Maps a KrabiClaw external organization id to a REAL local organization id, filled in per-test by `beforeEach`. */
const identityState = vi.hoisted((): IdentityTestState => ({ orgIdByExternalId: {} }));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service', () => ({
  krabiclawIdentityResolverService: {
    resolveIdentity: vi.fn(async ({ externalOrganizationId }: { externalOrganizationId: string }) => {
      const organizationId = identityState.orgIdByExternalId[externalOrganizationId];
      if (!organizationId) {
        throw new Error(`Test setup error: no local organization mapped for ${externalOrganizationId}`);
      }
      return { organizationId, userId: null };
    }),
  },
}));

vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: vi.fn(async () => 'event-id-1') },
}));

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

// Mocked at the module boundary — this suite only exercises recovery/status/tenant scoping against
// Real Postgres rows, never real Stripe I/O (same convention as
// `get-intake-by-request-reference.operation.test.ts`).
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    paymentLinks: { create: vi.fn(), retrieve: vi.fn() },
  },
}));

vi.mock('@/shared/events/definitions', async (importOriginal) => {
  // Narrow, precedent-matching shape (same pattern as this file's `@/shared/config` mock above)
  // Covering only the two exports overridden below — `...actual` still spreads every other real
  // Export through at runtime; only the type is intentionally narrower than the real module.
  const actual = await importOriginal<{
    IntakePaymentCreated: typeof IntakePaymentCreated;
    IntakeSubmitted: typeof IntakeSubmitted;
  }>();
  return {
    ...actual,
    IntakePaymentCreated: { dispatch: vi.fn() },
    IntakeSubmitted: { dispatch: vi.fn() },
  };
});

const anonymousHeaders = (externalOrganizationId: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${INTAKE_TOKEN}`,
  'x-krabiclaw-organization-id': externalOrganizationId,
  'x-krabiclaw-actor-id': 'ext-anon-1',
  'x-krabiclaw-actor-kind': 'anonymous',
  ...extra,
});

describe('intake facade cross-tenant rejection against real seeded rows (task review Important #4)', () => {
  let orgA: TestOrganization = { id: '', name: '', slug: '' };
  let orgB: TestOrganization = { id: '', name: '', slug: '' };

  beforeEach(async () => {
    orgA = await authHelpers.createTestOrganization();
    orgB = await authHelpers.createTestOrganization();
    identityState.orgIdByExternalId = { 'ext-org-a': orgA.id, 'ext-org-b': orgB.id };
  });

  it('creates a real intake for org A and recovers it for org A by request reference and by status', async () => {
    const requestReference = randomUUID();

    const createRes = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-a', { 'x-krabiclaw-request-reference': requestReference }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });
    expect(createRes.status).toBe(201);
    // SAFETY: the 201 status assertion above confirms this is
    // `createPracticeClientIntakeResponseSchema`'s real (unmocked) shape, which always includes `uuid`.
    const created = (await createRes.json()) as { uuid: string };

    const recoverRes = await krabiclawIntegrationApp.request(`/intakes/requests/${requestReference}`, {
      headers: anonymousHeaders('ext-org-a'),
    });
    expect(recoverRes.status).toBe(200);
    // SAFETY: the 200 status assertion above confirms this is the same real
    // `createPracticeClientIntakeResponseSchema` shape (recovery returns the same response contract as create).
    const recovered = (await recoverRes.json()) as { uuid: string };
    expect(recovered.uuid).toBe(created.uuid);

    const statusRes = await krabiclawIntegrationApp.request(`/intakes/${created.uuid}/status`, {
      headers: anonymousHeaders('ext-org-a', { 'x-krabiclaw-request-reference': requestReference }),
    });
    expect(statusRes.status).toBe(200);
  });

  it('does not recover an org A intake when queried under org B by request reference (real cross-tenant rejection, AE2)', async () => {
    const requestReference = randomUUID();

    const createRes = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-a', { 'x-krabiclaw-request-reference': requestReference }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });
    expect(createRes.status).toBe(201);

    const res = await krabiclawIntegrationApp.request(`/intakes/requests/${requestReference}`, {
      headers: anonymousHeaders('ext-org-b'),
    });

    expect(res.status).toBe(404);
  });

  it('rejects a status lookup for a real org A intake UUID presented under org B, even with the correct request reference (real tenant check, R14)', async () => {
    const requestReference = randomUUID();

    const createRes = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-a', { 'x-krabiclaw-request-reference': requestReference }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });
    expect(createRes.status).toBe(201);
    // SAFETY: the 201 status assertion above confirms this is
    // `createPracticeClientIntakeResponseSchema`'s real (unmocked) shape, which always includes `uuid`.
    const created = (await createRes.json()) as { uuid: string };

    const res = await krabiclawIntegrationApp.request(`/intakes/${created.uuid}/status`, {
      headers: anonymousHeaders('ext-org-b', { 'x-krabiclaw-request-reference': requestReference }),
    });

    expect(res.status).toBe(404);
  });

  it('rejects a status lookup for a real org A intake UUID under org A with the wrong request reference (real key comparison, not mocked)', async () => {
    const requestReference = randomUUID();
    const wrongReference = randomUUID();

    const createRes = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-a', { 'x-krabiclaw-request-reference': requestReference }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });
    expect(createRes.status).toBe(201);
    // SAFETY: the 201 status assertion above confirms this is
    // `createPracticeClientIntakeResponseSchema`'s real (unmocked) shape, which always includes `uuid`.
    const created = (await createRes.json()) as { uuid: string };

    const res = await krabiclawIntegrationApp.request(`/intakes/${created.uuid}/status`, {
      headers: anonymousHeaders('ext-org-a', { 'x-krabiclaw-request-reference': wrongReference }),
    });

    expect(res.status).toBe(404);
  });
});
