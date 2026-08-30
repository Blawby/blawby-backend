import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp from '@/modules/krabiclaw-integration/http';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import { createConnectedAccount } from '@/modules/onboarding/operations/create-connected-account.operation';
import { getConnectStatus } from '@/modules/onboarding/operations/get-connect-status.operation';
import { getConnectedAccount } from '@/modules/onboarding/operations/get-connected-account.operation';
import { getPracticeDetails } from '@/modules/practice/operations/get-practice-details.operation';
import { upsertPracticeDetails } from '@/modules/practice/operations/upsert-practice-details.operation';
import { createAccountSession } from '@/modules/stripe/operations/create-account-session.operation';
import type { config } from '@/shared/config';

/**
 * Contract tests for U3's practice and Connect facade routes, exercised
 * against the REAL production `krabiclawIntegrationApp` export (not a local
 * fixture app) — proving the routes registered in `http.ts` via
 * `registerFacadeRoute` (route-registry.ts) are actually reachable end to
 * end through the full policy-gate chain built in U2, with every Legal
 * Operation this unit calls mocked at its own module boundary (KTD4 — the
 * handler dispatches exactly one operation per use case, nothing lower).
 */

interface KrabiClawTestConfigState {
  facadeEnabled: boolean;
  rolloutGroups: Record<string, boolean>;
  connect: { returnUrl: string | undefined; refreshUrl: string | undefined };
}

/**
 * `connect`'s field type is declared via the `vi.hoisted` factory's return
 * type annotation (rather than a per-field `as string | undefined` cast) so
 * the "fails closed with no configured Connect callback URLs" test below
 * can reassign `configState.connect` to `{ returnUrl: undefined, refreshUrl:
 * undefined }` without an unsafe widening assertion.
 */
const configState = vi.hoisted(
  (): KrabiClawTestConfigState => ({
    facadeEnabled: true,
    rolloutGroups: {
      'practice-read': true,
      'practice-mutation': true,
      connect: true,
      'intake-without-payment': true,
      'intake-payment': true,
      engagement: true,
    },
    connect: {
      returnUrl: 'https://app.blawby.com/onboarding/return',
      refreshUrl: 'https://app.blawby.com/onboarding/refresh',
    },
  })
);

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
        get connect() {
          return configState.connect;
        },
      },
    },
  };
});

/** `legal:practice` for one token, `legal:connect` for the other — proves R2/AE1 scope isolation without a real OAuth grant. */
const PRACTICE_TOKEN = 'practice-scoped-token';
const CONNECT_TOKEN = 'connect-scoped-token';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', async () => {
  const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
  return {
    verifyFacadeToken: vi.fn(async (token: string | undefined) => {
      if (token === 'practice-scoped-token') {
        return { clientId: 'fixed-client', grantedScopes: new Set(['legal:practice']) };
      }
      if (token === 'connect-scoped-token') {
        return { clientId: 'fixed-client', grantedScopes: new Set(['legal:connect']) };
      }
      throw new KrabiClawMachineAuthError('Invalid access token');
    }),
  };
});

/** Resolves a distinct local organization/user id per external organization id, so two different KrabiClaw orgs never collide on the same local anchor (proves the facade never conflates tenants when a request_key is replayed cross-org). */
vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-directory.service', () => ({
  krabiclawDirectoryService: {
    getOrganizationDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Acme Legal', slug: 'acme-legal' })),
    getUserDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Jane Roe', email: 'jane@example.test' })),
  },
}));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service', () => ({
  krabiclawIdentityResolverService: {
    resolveIdentity: vi.fn(async ({ externalOrganizationId }: { externalOrganizationId: string }) => ({
      organizationId: `local-${externalOrganizationId}`,
      userId: 'local-user-1',
    })),
  },
}));

vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: vi.fn(async () => 'event-id-1') },
}));

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@/modules/practice/operations/get-practice-details.operation', () => ({
  getPracticeDetails: vi.fn(),
}));
vi.mock('@/modules/practice/operations/upsert-practice-details.operation', () => ({
  upsertPracticeDetails: vi.fn(),
}));
vi.mock('@/modules/onboarding/operations/create-connected-account.operation', () => ({
  createConnectedAccount: vi.fn(),
}));
vi.mock('@/modules/onboarding/operations/get-connect-status.operation', () => ({
  getConnectStatus: vi.fn(),
}));
vi.mock('@/modules/onboarding/operations/get-connected-account.operation', () => ({
  getConnectedAccount: vi.fn(),
}));
vi.mock('@/modules/stripe/operations/create-account-session.operation', () => ({
  createAccountSession: vi.fn(),
}));

const humanHeaders = (organizationId: string, token: string) => ({
  authorization: `Bearer ${token}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
});

const anonymousHeaders = (organizationId: string, token: string) => ({
  authorization: `Bearer ${token}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-anon-1',
  'x-krabiclaw-actor-kind': 'anonymous',
});

const practiceDetailsResponseFixture = {
  id: 'local-ext-org-1',
  name: 'Acme Legal',
  slug: 'acme-legal',
  logo: null,
  business_phone: null,
  business_email: null,
  website: null,
  consultation_fee: null,
  payment_url: null,
  calendly_url: null,
  intro_message: null,
  overview: null,
  accent_color: null,
  is_public: true,
  payment_link_enabled: null,
  billing_increment_minutes: 15,
  services: [],
  supported_states: null,
  address: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const connectStatusResponseFixture = {
  practice_uuid: 'local-ext-org-1',
  connected_account_id: null,
  stripe_account_id: null,
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
};

beforeEach(() => {
  configState.facadeEnabled = true;
  configState.rolloutGroups = {
    'practice-read': true,
    'practice-mutation': true,
    connect: true,
    'intake-without-payment': true,
    'intake-payment': true,
    engagement: true,
  };
  configState.connect = {
    returnUrl: 'https://app.blawby.com/onboarding/return',
    refreshUrl: 'https://app.blawby.com/onboarding/refresh',
  };
  vi.mocked(getPracticeDetails).mockReset();
  vi.mocked(upsertPracticeDetails).mockReset();
  vi.mocked(createConnectedAccount).mockReset();
  vi.mocked(getConnectStatus).mockReset();
  vi.mocked(getConnectedAccount).mockReset();
  vi.mocked(createAccountSession).mockReset();
  vi.mocked(verifyFacadeToken).mockClear();
  vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
  vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();
});

describe('krabiclaw practice facade routes', () => {
  it('reaches the owning Legal Operation and returns its result for GET /practice/details', async () => {
    vi.mocked(getPracticeDetails).mockResolvedValue(practiceDetailsResponseFixture);

    const res = await krabiclawIntegrationApp.request('/practice/details', {
      headers: humanHeaders('ext-org-1', PRACTICE_TOKEN),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(practiceDetailsResponseFixture);
    expect(getPracticeDetails).toHaveBeenCalledWith({ organizationId: 'local-ext-org-1' }, expect.any(Object));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects a legal:connect-scoped token for a practice route before D1 (R2/AE1)', async () => {
    const res = await krabiclawIntegrationApp.request('/practice/details', {
      headers: humanHeaders('ext-org-1', CONNECT_TOKEN),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'facade_forbidden' } });
    expect(getPracticeDetails).not.toHaveBeenCalled();
    expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
  });

  it('rejects practice mutation when only practice-read is rolled out (R26/AE8)', async () => {
    configState.rolloutGroups = { ...configState.rolloutGroups, 'practice-mutation': false };

    const res = await krabiclawIntegrationApp.request('/practice/details', {
      method: 'POST',
      headers: { ...humanHeaders('ext-org-1', PRACTICE_TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ business_email: 'contact@example.test' }),
    });

    expect(res.status).toBe(403);
    expect(upsertPracticeDetails).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied identity fields on a practice mutation instead of silently dropping them (R14)', async () => {
    const res = await krabiclawIntegrationApp.request('/practice/details', {
      method: 'PATCH',
      headers: { ...humanHeaders('ext-org-1', PRACTICE_TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ business_email: 'contact@example.test', organization_id: 'attacker-controlled-org' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
    expect(upsertPracticeDetails).not.toHaveBeenCalled();
  });

  it('accepts a legitimate contact-adjacent business field while deriving organization identity server-side, never from the body', async () => {
    vi.mocked(upsertPracticeDetails).mockResolvedValue(practiceDetailsResponseFixture);

    const res = await krabiclawIntegrationApp.request('/practice/details', {
      method: 'PATCH',
      headers: { ...humanHeaders('ext-org-1', PRACTICE_TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ business_email: 'contact@example.test' }),
    });

    expect(res.status).toBe(200);
    expect(upsertPracticeDetails).toHaveBeenCalledWith(
      { organizationId: 'local-ext-org-1', data: { business_email: 'contact@example.test' } },
      expect.objectContaining({ organizationId: 'local-ext-org-1' })
    );
  });

  it('reserializes a missing-practice 404 into the reviewed resource_not_found contract (R15/KTD8)', async () => {
    vi.mocked(getPracticeDetails).mockRejectedValue(
      new HTTPException(404, { message: 'Practice not found for local-ext-org-1' })
    );

    const res = await krabiclawIntegrationApp.request('/practice/details', {
      headers: humanHeaders('ext-org-1', PRACTICE_TOKEN),
    });

    expect(res.status).toBe(404);
    // SAFETY: the 404 status assertion above confirms this response came from `http.ts`'s `onError` handler,
    // Which always emits the reviewed `{ error: { code, message }, request_id }` envelope for every mapped
    // Error (see `errorEnvelope` in http.ts) — the response body shape is guaranteed, not merely assumed.
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('resource_not_found');
    expect(body.error.message).not.toContain('local-ext-org-1');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('krabiclaw Connect facade routes', () => {
  it('rejects an anonymous actor on every Connect route (R11)', async () => {
    const res = await krabiclawIntegrationApp.request('/connect/status', {
      headers: anonymousHeaders('ext-org-1', CONNECT_TOKEN),
    });

    expect(res.status).toBe(403);
    expect(getConnectStatus).not.toHaveBeenCalled();
  });

  it('rejects a legal:practice-scoped token on a Connect route (R2)', async () => {
    const res = await krabiclawIntegrationApp.request('/connect/status', {
      headers: humanHeaders('ext-org-1', PRACTICE_TOKEN),
    });

    expect(res.status).toBe(403);
    expect(getConnectStatus).not.toHaveBeenCalled();
  });

  it('GET /connect/status reaches the owning operation and returns its result', async () => {
    vi.mocked(getConnectStatus).mockResolvedValue(connectStatusResponseFixture);

    const res = await krabiclawIntegrationApp.request('/connect/status', {
      headers: humanHeaders('ext-org-1', CONNECT_TOKEN),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(connectStatusResponseFixture);
    expect(getConnectStatus).toHaveBeenCalledWith({ organizationId: 'local-ext-org-1' }, expect.any(Object));
  });

  it('GET /connect/account reserializes a missing-account 404 into the reviewed contract, without leaking a Stripe account id', async () => {
    vi.mocked(getConnectedAccount).mockRejectedValue(
      new HTTPException(404, { message: 'No connected Stripe account found for org acct_super_secret_123' })
    );

    const res = await krabiclawIntegrationApp.request('/connect/account', {
      headers: humanHeaders('ext-org-1', CONNECT_TOKEN),
    });

    expect(res.status).toBe(404);
    // SAFETY: the 404 status assertion above confirms this response came from `http.ts`'s `onError` handler,
    // Which always emits the reviewed `{ error: { code, message }, request_id }` envelope for every mapped
    // Error (see `errorEnvelope` in http.ts) — the response body shape is guaranteed, not merely assumed.
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('resource_not_found');
    expect(body.error.message).not.toContain('acct_super_secret_123');
  });

  it('POST /connect/account-session reaches the owning Stripe operation and returns its result', async () => {
    vi.mocked(createAccountSession).mockResolvedValue({
      client_secret: 'accs_secret_123',
      expires_at: 1_700_000_000,
      account_id: 'acct_1234567890',
    });

    const res = await krabiclawIntegrationApp.request('/connect/account-session', {
      method: 'POST',
      headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
      body: JSON.stringify({ components: ['payments', 'balances'] }),
    });

    expect(res.status).toBe(201);
    expect(createAccountSession).toHaveBeenCalledWith(
      { organizationId: 'local-ext-org-1', components: ['payments', 'balances'] },
      expect.any(Object)
    );
  });

  describe('POST /connect/connected-accounts', () => {
    const validBody = {
      request_key: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      return_url: 'https://app.blawby.com/onboarding/return',
      refresh_url: 'https://app.blawby.com/onboarding/refresh',
    };

    it('requires a strict UUID v4 request_key (R28) — a malformed key fails before any operation call', async () => {
      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, request_key: 'not-a-uuid' }),
      });

      expect(res.status).toBe(400);
      expect(createConnectedAccount).not.toHaveBeenCalled();
    });

    it('rejects caller-supplied identity fields (R14)', async () => {
      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, user_id: 'attacker-controlled-user' }),
      });

      expect(res.status).toBe(400);
      expect(createConnectedAccount).not.toHaveBeenCalled();
    });

    it('rejects a non-allowlisted callback URL before any Stripe call (R13/KTD7)', async () => {
      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, return_url: 'https://evil.example.com/return' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
      expect(createConnectedAccount).not.toHaveBeenCalled();
    });

    it('fails closed when the deployment has no configured Connect callback URLs, before any Stripe call', async () => {
      configState.connect = { returnUrl: undefined, refreshUrl: undefined };

      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(503);
      expect(createConnectedAccount).not.toHaveBeenCalled();
    });

    it('derives the Connect account email from the D1-verified human actor, never from the request body', async () => {
      vi.mocked(createConnectedAccount).mockResolvedValue({
        ...connectStatusResponseFixture,
        connected_account_id: 'row-1',
      });

      await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(createConnectedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jane@example.test', requestKey: validBody.request_key }),
        expect.any(Object)
      );
    });

    it('passes the same request_key through for a same-organization replay, recovering rather than duplicating (R28)', async () => {
      vi.mocked(createConnectedAccount).mockResolvedValue({
        ...connectStatusResponseFixture,
        connected_account_id: 'row-1',
      });

      const request = () =>
        krabiclawIntegrationApp.request('/connect/connected-accounts', {
          method: 'POST',
          headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
          body: JSON.stringify(validBody),
        });

      await request();
      await request();

      expect(createConnectedAccount).toHaveBeenCalledTimes(2);
      const [firstCallParams] = vi.mocked(createConnectedAccount).mock.calls[0]!;
      const [secondCallParams] = vi.mocked(createConnectedAccount).mock.calls[1]!;
      expect(firstCallParams).toMatchObject({ organizationId: 'local-ext-org-1', requestKey: validBody.request_key });
      expect(secondCallParams).toMatchObject({ organizationId: 'local-ext-org-1', requestKey: validBody.request_key });
    });

    it('a cross-organization reuse of the same request_key resolves to a distinct organizationId, never the first organization (no tenant conflation)', async () => {
      vi.mocked(createConnectedAccount).mockResolvedValue({
        ...connectStatusResponseFixture,
        connected_account_id: 'row-1',
      });

      await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });
      await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-2', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(createConnectedAccount).toHaveBeenCalledTimes(2);
      const [firstCallParams] = vi.mocked(createConnectedAccount).mock.calls[0]!;
      const [secondCallParams] = vi.mocked(createConnectedAccount).mock.calls[1]!;
      expect(firstCallParams).toMatchObject({ organizationId: 'local-ext-org-1', requestKey: validBody.request_key });
      expect(secondCallParams).toMatchObject({ organizationId: 'local-ext-org-2', requestKey: validBody.request_key });
      // SAFETY: the `toMatchObject` assertions immediately above already confirm both mock call params carry a
      // String `organizationId` (`local-ext-org-1` / `local-ext-org-2`), so narrowing to read that field back out
      // For the direct not-equal comparison below is guaranteed to succeed at runtime.
      expect((firstCallParams as { organizationId: string }).organizationId).not.toBe(
        (secondCallParams as { organizationId: string }).organizationId
      );
    });

    it('reserializes a Stripe idempotency conflict (409) into the reviewed state_conflict contract, never the raw Stripe message', async () => {
      vi.mocked(createConnectedAccount).mockRejectedValue(
        new HTTPException(409, { message: 'Stripe idempotency key already in use for acct_secret_456' })
      );

      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(409);
      // SAFETY: the 409 status assertion above confirms this response came from `http.ts`'s `onError` handler,
      // Which always emits the reviewed `{ error: { code, message }, request_id }` envelope for every mapped
      // Error (see `errorEnvelope` in http.ts) — the response body shape is guaranteed, not merely assumed.
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('state_conflict');
      expect(body.error.message).not.toContain('acct_secret_456');
    });

    it('reserializes a permanent Connect failure (422) into the reviewed prerequisite_failed contract', async () => {
      vi.mocked(createConnectedAccount).mockRejectedValue(
        new HTTPException(422, { message: 'Stripe rejected the account: raw dependency detail' })
      );

      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(422);
      // SAFETY: the 422 status assertion above confirms this response came from `http.ts`'s `onError` handler,
      // Which always emits the reviewed `{ error: { code, message }, request_id }` envelope for every mapped
      // Error (see `errorEnvelope` in http.ts) — the response body shape is guaranteed, not merely assumed.
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('prerequisite_failed');
      expect(body.error.message).not.toContain('raw dependency detail');
    });

    it('sanitizes a genuinely unexpected (non-HTTPException) operation failure to 503, never leaking its message', async () => {
      vi.mocked(createConnectedAccount).mockRejectedValue(
        new Error('unexpected invariant violation with sensitive detail')
      );

      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(503);
      // SAFETY: the 503 status assertion above confirms this response came from `http.ts`'s `onError` handler,
      // Which always emits the reviewed `{ error: { code, message }, request_id }` envelope for every mapped
      // Error (see `errorEnvelope` in http.ts) — the response body shape is guaranteed, not merely assumed.
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('dependency_unavailable');
      expect(body.error.message).not.toContain('sensitive detail');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('marks a successful creation response Cache-Control: no-store as well (R22)', async () => {
      vi.mocked(createConnectedAccount).mockResolvedValue({
        ...connectStatusResponseFixture,
        connected_account_id: 'row-1',
      });

      const res = await krabiclawIntegrationApp.request('/connect/connected-accounts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', CONNECT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(201);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
  });
});
