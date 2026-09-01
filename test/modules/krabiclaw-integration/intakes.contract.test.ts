import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp from '@/modules/krabiclaw-integration/http';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import { createCheckoutSession } from '@/modules/practice-client-intakes/operations/create-checkout-session.operation';
import { createIntake } from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { getIntakeById } from '@/modules/practice-client-intakes/operations/get-intake-by-id.operation';
import { getIntakeByRequestReference } from '@/modules/practice-client-intakes/operations/get-intake-by-request-reference.operation';
import { getIntakeSettings } from '@/modules/practice-client-intakes/operations/get-intake-settings.operation';
import { getActorAccessibleIntake } from '@/modules/practice-client-intakes/operations/intake-actor-context';
import { listIntakes } from '@/modules/practice-client-intakes/operations/list-intakes.operation';
import { updateIntakeTriageStatus } from '@/modules/practice-client-intakes/operations/update-intake-triage-status.operation';
import { verifyPostPayConsistency } from '@/modules/practice-client-intakes/operations/verify-post-pay-consistency.operation';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { config } from '@/shared/config';

/**
 * Contract tests for U4's intake facade routes, exercised against the REAL
 * production `krabiclawIntegrationApp` export (not a local fixture app) —
 * proving the routes registered in `http.ts` via `registerFacadeRoute`
 * (route-registry.ts) are actually reachable end to end through the full
 * policy-gate chain built in U2, with every Legal Operation this unit calls
 * mocked at its own module boundary (KTD4).
 */

interface KrabiClawTestConfigState {
  facadeEnabled: boolean;
  rolloutGroups: Record<string, boolean>;
  connect: { returnUrl: string | undefined; refreshUrl: string | undefined };
}

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

/** A single `legal:intakes`-scoped token — every route in this family accepts it. */
const INTAKE_TOKEN = 'intake-scoped-token';
const PRACTICE_TOKEN = 'practice-scoped-token';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', async () => {
  const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
  return {
    verifyFacadeToken: vi.fn(async (token: string | undefined) => {
      if (token === 'intake-scoped-token') {
        return { clientId: 'fixed-client', grantedScopes: new Set(['legal:intakes']) };
      }
      if (token === 'practice-scoped-token') {
        return { clientId: 'fixed-client', grantedScopes: new Set(['legal:practice']) };
      }
      throw new KrabiClawMachineAuthError('Invalid access token');
    }),
  };
});

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-directory.service', () => ({
  krabiclawDirectoryService: {
    getOrganizationDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Acme Legal', slug: 'acme-legal' })),
    getUserDirectoryRecord: vi.fn(async (id: string) => ({ id, name: 'Jane Roe', email: 'jane@example.test' })),
  },
}));

vi.mock('@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service', () => ({
  krabiclawIdentityResolverService: {
    resolveIdentity: vi.fn(
      async ({ externalOrganizationId, actorKind }: { externalOrganizationId: string; actorKind: string }) => ({
        organizationId: `local-${externalOrganizationId}`,
        userId: actorKind === 'human' ? 'local-user-1' : null,
      })
    ),
  },
}));

vi.mock('@/shared/events/definitions/krabiclaw', () => ({
  KrabiClawActorAttributed: { dispatch: vi.fn(async () => 'event-id-1') },
}));

vi.mock('@/shared/middleware/rateLimit', () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@/modules/practice-client-intakes/operations/get-intake-settings.operation', () => ({
  getIntakeSettings: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/create-intake.operation', () => ({
  createIntake: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/get-intake-by-request-reference.operation', () => ({
  getIntakeByRequestReference: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/intake-actor-context', () => ({
  getActorAccessibleIntake: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/list-intakes.operation', () => ({
  listIntakes: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/get-intake-by-id.operation', () => ({
  getIntakeById: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/update-intake-triage-status.operation', () => ({
  updateIntakeTriageStatus: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/create-checkout-session.operation', () => ({
  createCheckoutSession: vi.fn(),
}));
vi.mock('@/modules/practice-client-intakes/operations/verify-post-pay-consistency.operation', () => ({
  verifyPostPayConsistency: vi.fn(),
}));

const REQUEST_REFERENCE_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const REQUEST_REFERENCE_B = '4fa85f64-5717-4562-b3fc-2c963f66afa7';
const INTAKE_UUID = '11111111-1111-4111-8111-111111111111';

const humanHeaders = (organizationId: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${INTAKE_TOKEN}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
  ...extra,
});

const anonymousHeaders = (organizationId: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${INTAKE_TOKEN}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-anon-1',
  'x-krabiclaw-actor-kind': 'anonymous',
  ...extra,
});

/** Minimal fixture satisfying `SelectPracticeClientIntake`'s full column set. */
const buildIntakeFixture = (overrides: Partial<SelectPracticeClientIntake> = {}): SelectPracticeClientIntake => ({
  id: INTAKE_UUID,
  organization_id: 'local-ext-org-1',
  connected_account_id: null,
  practice_service_id: null,
  stripe_payment_link_id: null,
  stripe_payment_intent_id: null,
  stripe_charge_id: null,
  stripe_checkout_session_id: null,
  krabiclaw_request_key: REQUEST_REFERENCE_A,
  amount: 0,
  application_fee: null,
  currency: 'usd',
  status: 'open',
  triage_status: 'pending_review',
  triage_reason: null,
  triage_decided_at: null,
  metadata: null,
  address_id: null,
  conversation_id: null,
  client_ip: null,
  user_agent: null,
  invitation_prefill_token_hash: null,
  urgency: null,
  desired_outcome: null,
  court_date: null,
  has_documents: null,
  income: null,
  household_size: null,
  case_strength: null,
  transcript_summary: null,
  enrichment_status: 'not_requested',
  enrichment_version: 0,
  enrichment_attempt_count: 0,
  enrichment_claim_token: null,
  enrichment_model: null,
  enrichment_error_code: null,
  enrichment_requested_at: null,
  enriched_at: null,
  jurisdiction_status: null,
  jurisdiction_match: null,
  succeeded_at: null,
  created_at: new Date('2024-01-01T00:00:00.000Z'),
  updated_at: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

const createIntakeResponseFixture = {
  uuid: INTAKE_UUID,
  payment_link_url: null,
  amount: 0,
  currency: 'usd',
  status: 'succeeded',
  organization: { name: 'Acme Legal' },
};

const intakeStatusResponseFixture = {
  uuid: INTAKE_UUID,
  organization_id: 'local-ext-org-1',
  amount: 0,
  currency: 'usd',
  status: 'succeeded',
  triage_status: 'pending_review',
  triage_reason: null,
  triage_decided_at: null,
  succeeded_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
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
  vi.mocked(getIntakeSettings).mockReset();
  vi.mocked(createIntake).mockReset();
  vi.mocked(getIntakeByRequestReference).mockReset();
  vi.mocked(getActorAccessibleIntake).mockReset();
  vi.mocked(listIntakes).mockReset();
  vi.mocked(getIntakeById).mockReset();
  vi.mocked(updateIntakeTriageStatus).mockReset();
  vi.mocked(createCheckoutSession).mockReset();
  vi.mocked(verifyPostPayConsistency).mockReset();
  vi.mocked(verifyFacadeToken).mockClear();
  vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
  vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();
});

describe('GET /intakes/settings', () => {
  it('reaches getIntakeSettings with subscriptionPolicy enforce (matches the owning route, no revenue-gate bypass) and returns its result for a human actor', async () => {
    vi.mocked(getIntakeSettings).mockResolvedValue({
      organization: { id: 'local-ext-org-1', name: 'Acme Legal', slug: 'acme-legal' },
      settings: { payment_link_enabled: true, consultation_fee: 15000 },
      service_area: [],
      connected_account: { id: 'conn-1', charges_enabled: true },
      intake_template: {
        id: 'tmpl-1',
        slug: 'default',
        name: 'Default',
        intro_message: null,
        legal_disclaimer: null,
        payment_link_enabled: true,
        consultation_fee: 15000,
        fields: [],
      },
    });

    const res = await krabiclawIntegrationApp.request('/intakes/settings', { headers: humanHeaders('ext-org-1') });

    expect(res.status).toBe(200);
    expect(getIntakeSettings).toHaveBeenCalledWith(
      { organizationId: 'local-ext-org-1', templateSlug: undefined, subscriptionPolicy: 'enforce' },
      expect.any(Object)
    );
  });

  it('is reachable by an anonymous actor (R11: public intake accepts human or anonymous)', async () => {
    vi.mocked(getIntakeSettings).mockRejectedValue(new HTTPException(404, { message: 'Organization not found' }));

    const res = await krabiclawIntegrationApp.request('/intakes/settings', { headers: anonymousHeaders('ext-org-1') });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'resource_not_found' } });
  });

  it('rejects a legal:practice-scoped token before D1 (R2)', async () => {
    const res = await krabiclawIntegrationApp.request('/intakes/settings', {
      headers: { ...humanHeaders('ext-org-1'), authorization: `Bearer ${PRACTICE_TOKEN}` },
    });

    expect(res.status).toBe(403);
    expect(getIntakeSettings).not.toHaveBeenCalled();
  });
});

describe('POST /intakes', () => {
  it('rejects a request with no request-reference header before any operation call (R5, KTD6)', async () => {
    const res = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: { ...anonymousHeaders('ext-org-1'), 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });

    expect(res.status).toBe(400);
    expect(createIntake).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied identity fields (organization_id, user_id) instead of silently dropping them (R14)', async () => {
    const res = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: 0,
        email: 'client@example.test',
        name: 'Jane Client',
        user_id: 'attacker-controlled-user',
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
    expect(createIntake).not.toHaveBeenCalled();
  });

  it('accepts an anonymous submission and persists the trusted request reference as the requestKey (R5)', async () => {
    vi.mocked(createIntake).mockResolvedValue(createIntakeResponseFixture);

    const res = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });

    expect(res.status).toBe(201);
    expect(createIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'local-ext-org-1',
        requestKey: REQUEST_REFERENCE_A,
        subscriptionPolicy: 'enforce',
      }),
      expect.any(Object)
    );
  });

  it('never forwards x-forwarded-for as clientIp (R27: no browser-forwarding-header trust outside the engagement-acceptance route)', async () => {
    vi.mocked(createIntake).mockResolvedValue(createIntakeResponseFixture);

    await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.7',
      },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });

    const [[callParams]] = vi.mocked(createIntake).mock.calls;
    expect(callParams.data).not.toHaveProperty('clientIp');
  });

  it('plumbs the same request reference through on a same-key retry, returning one recovered intake both times (concurrent-safe idempotency)', async () => {
    vi.mocked(createIntake).mockResolvedValue(createIntakeResponseFixture);

    const request = () =>
      krabiclawIntegrationApp.request('/intakes', {
        method: 'POST',
        headers: {
          ...anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
      });

    const [firstRes, secondRes] = await Promise.all([request(), request()]);

    expect(firstRes.status).toBe(201);
    expect(secondRes.status).toBe(201);
    expect(await firstRes.json()).toEqual(createIntakeResponseFixture);
    expect(await secondRes.json()).toEqual(createIntakeResponseFixture);
    expect(vi.mocked(createIntake).mock.calls).toHaveLength(2);
    for (const [callParams] of vi.mocked(createIntake).mock.calls) {
      expect(callParams).toMatchObject({ requestKey: REQUEST_REFERENCE_A });
    }
  });

  /**
   * Renamed from an earlier ("same-key different-payload conflict") title
   * that didn't match reality (task review Important #5) — confirmed against
   * `create-intake.operation.ts`'s own `findRecoverableIntakeByRequestKey`
   * that a same-key retry ALWAYS recovers the original result regardless of
   * payload differences; there is no same-key/different-payload conflict
   * anywhere in this operation to preserve. This test only proves an
   * ordinary validation failure (unrelated to the request key) is
   * reserialized correctly.
   */
  it('a create-intake validation failure unrelated to the request key (e.g. invalid practice service) is reserialized as validation_failed (400)', async () => {
    vi.mocked(createIntake).mockRejectedValue(new HTTPException(400, { message: 'Invalid practice service' }));

    const res = await krabiclawIntegrationApp.request('/intakes', {
      method: 'POST',
      headers: {
        ...anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: 0, email: 'client@example.test', name: 'Jane Client' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });
});

describe('GET /intakes/requests/{request_id} (recovery)', () => {
  it('recovers a prior intake by request reference for an anonymous actor', async () => {
    vi.mocked(getIntakeByRequestReference).mockResolvedValue(createIntakeResponseFixture);

    const res = await krabiclawIntegrationApp.request(`/intakes/requests/${REQUEST_REFERENCE_A}`, {
      headers: anonymousHeaders('ext-org-1'),
    });

    expect(res.status).toBe(200);
    expect(getIntakeByRequestReference).toHaveBeenCalledWith(
      { organizationId: 'local-ext-org-1', requestKey: REQUEST_REFERENCE_A },
      expect.any(Object)
    );
  });

  it('a non-existent request reference returns the uniform 404 (no resource-existence detail)', async () => {
    vi.mocked(getIntakeByRequestReference).mockRejectedValue(
      new HTTPException(404, { message: 'No intake found for the given request reference' })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/requests/${REQUEST_REFERENCE_A}`, {
      headers: anonymousHeaders('ext-org-1'),
    });

    expect(res.status).toBe(404);
    // SAFETY: the 404 status assertion above confirms this response was built by
    // `reviewedDomainErrorResponse` (intakes.handlers.ts), which always returns the reviewed
    // `{ error: { code, message }, request_id }` envelope — the body shape is guaranteed.
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('resource_not_found');
  });
});

describe('GET /intakes/{uuid}/status — anonymous follow-up authorization (KTD6, R5, R14)', () => {
  it('rejects a request with no request-reference header before any operation call', async () => {
    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: anonymousHeaders('ext-org-1'),
    });

    expect(res.status).toBe(400);
    expect(getActorAccessibleIntake).not.toHaveBeenCalled();
  });

  it('returns status when the trusted request reference matches the intake, formatted via the real (unmocked) intakeSharedHelpers formatter', async () => {
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A, status: 'succeeded' })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });

    expect(res.status).toBe(200);
    // SAFETY: the 200 status assertion above confirms `getIntakeStatusHandler` returned
    // `c.json(result, 200)` with `result` built by the real (unmocked)
    // `intakeSharedHelpers.formatIntakeStatusResponse`, which always includes `uuid` and `status` —
    // The shape asserted here is guaranteed.
    const body = (await res.json()) as { uuid: string; status: string };
    expect(body.uuid).toBe(INTAKE_UUID);
    expect(body.status).toBe('succeeded');
  });

  /**
   * Task review Critical fix: `getIntakeStatusHandler` used to call the
   * non-facade `getIntakeStatus` operation with `isStaff: true`, which flows
   * into `formatIntakeStatusResponse({ isAdmin: ctx.isStaff })` and renders
   * the full staff/admin projection — including `transcript_summary` and
   * every `enrichment_*` field — to this route's `human-or-anonymous`
   * callers. The handler no longer calls `getIntakeStatus` at all; it formats
   * directly via `intakeSharedHelpers.formatIntakeStatusResponse` with a
   * hard-coded `isAdmin: false`. This test proves the admin projection never
   * reaches the wire, using a fixture where every admin-only field is
   * populated (not merely absent) so a regression back to `isAdmin: true`
   * would be caught even if the underlying row happened to have empty
   * admin fields in a lazier test.
   */
  it('never renders the staff/admin projection, even when the intake row carries populated admin-only fields', async () => {
    const sensitiveIntake = buildIntakeFixture({
      krabiclaw_request_key: REQUEST_REFERENCE_A,
      transcript_summary: 'Sensitive AI-generated transcript summary',
      enrichment_status: 'succeeded',
      enrichment_version: 3,
      enrichment_attempt_count: 2,
      enrichment_model: 'gpt-4o',
      enrichment_error_code: 'none',
      enrichment_requested_at: new Date('2024-01-05T00:00:00.000Z'),
      enriched_at: new Date('2024-01-05T01:00:00.000Z'),
      conversation_id: '22222222-2222-4222-8222-222222222222',
      address_id: '33333333-3333-4333-8333-333333333333',
      metadata: { email: 'real-client@example.test', name: 'Real Client Name', phone: '555-1234' },
    });
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(sensitiveIntake);

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });

    expect(res.status).toBe(200);
    /**
     * `.pick()` off the route's own real response schema — no `as` cast, no hand-duplicated
     * field list. Picking only the fields this test uses excludes the schema's `z.date()`
     * timestamp fields (`created_at`, `triage_decided_at`, etc.), which don't round-trip through
     * JSON transport (dates arrive as strings), so parsing the full schema against fetched JSON
     * fails even though the picked subset parses cleanly.
     */
    const intakeStatusTestFields = intakeValidations.practiceClientIntakeStatusResponseSchema.pick({
      uuid: true,
      status: true,
      metadata: true,
      transcript_summary: true,
      enrichment_status: true,
      enrichment_version: true,
      enrichment_attempt_count: true,
      enrichment_model: true,
      enrichment_error_code: true,
      enrichment_requested_at: true,
      enriched_at: true,
      conversation_id: true,
      address_id: true,
    });
    const body = intakeStatusTestFields.parse(await res.json());
    for (const adminOnlyField of [
      'transcript_summary',
      'enrichment_status',
      'enrichment_version',
      'enrichment_attempt_count',
      'enrichment_model',
      'enrichment_error_code',
      'enrichment_requested_at',
      'enriched_at',
      'conversation_id',
      'address_id',
    ]) {
      expect(body).not.toHaveProperty(adminOnlyField);
    }
    // The redacted `{ email: '', name: '' }` shape — never the real client contact info — for a
    // Non-owning, non-admin caller (`isAuthorizedIntakeView` returns false with `isAdmin: false`
    // And no matching `requestingUserId`).
    expect(body.metadata).toEqual({ email: '', name: '' });
  });

  it('rejects a wrong request reference for a matching intake UUID with the uniform 404, never rendering intake details', async () => {
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_B }),
    });

    expect(res.status).toBe(404);
    // SAFETY: the 404 status assertion above confirms this response was built by the handler's
    // Own `reviewedDomainErrorResponse(c, PUBLIC_INTAKE_NOT_FOUND)` call (the inline
    // Request-reference-mismatch branch in `getIntakeStatusHandler`), which always returns the
    // Reviewed `{ error: { code, message }, request_id }` envelope — the body shape is guaranteed.
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('resource_not_found');
  });

  it('a cross-organization intake (tenant mismatch) also returns the uniform 404 — indistinguishable from a wrong reference (R14)', async () => {
    vi.mocked(getActorAccessibleIntake).mockRejectedValue(
      new HTTPException(403, { message: 'Organization does not match the authenticated context' })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });

    expect(res.status).toBe(404);
    // SAFETY: the 404 status assertion above confirms this response was built by
    // `reviewedDomainErrorResponse` via `mapPublicIntakeAccessError` (intakes.handlers.ts), which
    // Folds every 403/404 from `getActorAccessibleIntake` into the same reviewed
    // `{ error: { code, message }, request_id }` envelope — the body shape is guaranteed.
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('resource_not_found');
  });

  it('a genuinely non-existent intake returns the same 404 body as a wrong-reference rejection (R14 indistinguishability)', async () => {
    vi.mocked(getActorAccessibleIntake).mockRejectedValue(
      new HTTPException(404, { message: 'Practice client intake not found' })
    );

    const notFoundRes = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });
    const notFoundBody = await notFoundRes.json();

    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A })
    );
    const wrongRefRes = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_B }),
    });
    const wrongRefBody = await wrongRefRes.json();

    expect(notFoundRes.status).toBe(404);
    expect(wrongRefRes.status).toBe(404);
    expect(notFoundBody).toEqual(wrongRefBody);
  });

  it('is reachable by a verified human actor too, not only anonymous', async () => {
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/status`, {
      headers: humanHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });

    expect(res.status).toBe(200);
  });
});

describe('POST /intakes/{uuid}/checkout-session — payment family, request-reference required', () => {
  const checkoutSessionResponseFixture = {
    url: 'https://checkout.stripe.com/pay/cs_test_123',
    session_id: 'cs_test_123',
  };

  it('rejects a request with no request-reference header before any operation call', async () => {
    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/checkout-session`, {
      method: 'POST',
      headers: anonymousHeaders('ext-org-1'),
    });

    expect(res.status).toBe(400);
    expect(getActorAccessibleIntake).not.toHaveBeenCalled();
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates a checkout session when the trusted request reference matches the intake, delegating to the existing destination-charge operation', async () => {
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A })
    );
    vi.mocked(createCheckoutSession).mockResolvedValue(checkoutSessionResponseFixture);

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/checkout-session`, {
      method: 'POST',
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });

    expect(res.status).toBe(201);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: INTAKE_UUID }),
      expect.objectContaining({ isStaff: true })
    );
  });

  it('rejects a wrong request reference for a matching intake UUID with the uniform 404, never calling the checkout operation', async () => {
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/checkout-session`, {
      method: 'POST',
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_B }),
    });

    expect(res.status).toBe(404);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('reserializes a not-ready connected account (403) into the reviewed prerequisite_failed contract (422)', async () => {
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A })
    );
    vi.mocked(createCheckoutSession).mockRejectedValue(
      new HTTPException(403, { message: 'Connected account is not ready to accept payments' })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/checkout-session`, {
      method: 'POST',
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'prerequisite_failed' } });
  });

  it('reserializes an ineligible-intake-state (400) into the reviewed request_conflict contract (409)', async () => {
    vi.mocked(getActorAccessibleIntake).mockResolvedValue(
      buildIntakeFixture({ krabiclaw_request_key: REQUEST_REFERENCE_A })
    );
    vi.mocked(createCheckoutSession).mockRejectedValue(
      new HTTPException(400, { message: 'Intake is not eligible for checkout session creation' })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/checkout-session`, {
      method: 'POST',
      headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'request_conflict' } });
  });
});

describe('GET /intakes/{uuid}/post-pay/status — delegates entirely to verifyPostPayConsistency (U1)', () => {
  it('rejects a request with no request-reference header before any operation call', async () => {
    const res = await krabiclawIntegrationApp.request(
      `/intakes/${INTAKE_UUID}/post-pay/status?session_id=cs_test_123`,
      {
        headers: anonymousHeaders('ext-org-1'),
      }
    );

    expect(res.status).toBe(400);
    expect(verifyPostPayConsistency).not.toHaveBeenCalled();
  });

  it('reaches verifyPostPayConsistency with organization, intake UUID, session, and request reference', async () => {
    vi.mocked(verifyPostPayConsistency).mockResolvedValue({
      paid: true,
      intake_uuid: INTAKE_UUID,
      organization_id: 'local-ext-org-1',
    });

    const res = await krabiclawIntegrationApp.request(
      `/intakes/${INTAKE_UUID}/post-pay/status?session_id=cs_test_123`,
      { headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }) }
    );

    expect(res.status).toBe(200);
    expect(verifyPostPayConsistency).toHaveBeenCalledWith(
      {
        organizationId: 'local-ext-org-1',
        intakeUuid: INTAKE_UUID,
        sessionId: 'cs_test_123',
        requestKey: REQUEST_REFERENCE_A,
      },
      expect.any(Object)
    );
  });

  it('rejects a wrong request reference / wrong intake UUID / wrong organization via the operation-owned 404 (AE2, AE6)', async () => {
    vi.mocked(verifyPostPayConsistency).mockRejectedValue(
      new HTTPException(404, { message: 'Post-pay verification failed' })
    );

    const res = await krabiclawIntegrationApp.request(
      `/intakes/${INTAKE_UUID}/post-pay/status?session_id=cs_test_123`,
      { headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_B }) }
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'resource_not_found' } });
  });

  it('reserializes a session-conflict (409) from the operation into the reviewed request_conflict contract', async () => {
    vi.mocked(verifyPostPayConsistency).mockRejectedValue(
      new HTTPException(409, { message: 'Checkout session does not match the recorded session for this intake' })
    );

    const res = await krabiclawIntegrationApp.request(
      `/intakes/${INTAKE_UUID}/post-pay/status?session_id=cs_test_123`,
      { headers: anonymousHeaders('ext-org-1', { 'x-krabiclaw-request-reference': REQUEST_REFERENCE_A }) }
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'request_conflict' } });
  });
});

describe('staff-only intake routes reject anonymous actors and keep pagination envelopes (R11, R16)', () => {
  it('GET /intakes (list) rejects an anonymous actor before D1', async () => {
    const res = await krabiclawIntegrationApp.request('/intakes', { headers: anonymousHeaders('ext-org-1') });

    expect(res.status).toBe(403);
    expect(listIntakes).not.toHaveBeenCalled();
  });

  it('GET /intakes/{uuid} (detail) rejects an anonymous actor before D1', async () => {
    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}`, {
      headers: anonymousHeaders('ext-org-1'),
    });

    expect(res.status).toBe(403);
    expect(getIntakeById).not.toHaveBeenCalled();
  });

  it('PATCH /intakes/{uuid}/triage rejects an anonymous actor before D1', async () => {
    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/triage`, {
      method: 'PATCH',
      headers: { ...anonymousHeaders('ext-org-1'), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.status).toBe(403);
    expect(updateIntakeTriageStatus).not.toHaveBeenCalled();
  });

  it('GET /intakes (list) reaches listIntakes for a human actor and keeps the shared offset pagination envelope shape', async () => {
    vi.mocked(listIntakes).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });

    const res = await krabiclawIntegrationApp.request('/intakes?page=1&limit=20', {
      headers: humanHeaders('ext-org-1'),
    });

    expect(res.status).toBe(200);
    // SAFETY: the 200 status assertion above confirms `listIntakesHandler` returned
    // `c.json(result, 200)` with `result` being exactly the `{ data, pagination }` object this
    // Test mocked `listIntakes` to resolve above — the shape asserted here is guaranteed.
    const body = (await res.json()) as { data: unknown[]; pagination: { page: number; limit: number; total: number } };
    expect(body).toHaveProperty('data');
    expect(body.pagination).toEqual({ page: 1, limit: 20, total: 0 });
    expect(listIntakes).toHaveBeenCalledWith(
      { organizationId: 'local-ext-org-1', query: expect.objectContaining({ page: 1, limit: 20 }) },
      expect.any(Object)
    );
  });

  it('GET /intakes/{uuid} (detail) reaches getIntakeById for a human actor and returns its result', async () => {
    vi.mocked(getIntakeById).mockResolvedValue(intakeStatusResponseFixture);

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}`, {
      headers: humanHeaders('ext-org-1'),
    });

    expect(res.status).toBe(200);
    expect(getIntakeById).toHaveBeenCalledWith(INTAKE_UUID, expect.any(Object));
  });

  it('a staff tenant-mismatch is disclosed as 403 forbidden (distinct from the public family, which folds it into 404)', async () => {
    vi.mocked(getIntakeById).mockRejectedValue(
      new HTTPException(403, { message: 'Organization does not match the authenticated context' })
    );

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}`, {
      headers: humanHeaders('ext-org-1'),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('PATCH /intakes/{uuid}/triage reaches updateIntakeTriageStatus for a human actor', async () => {
    vi.mocked(updateIntakeTriageStatus).mockResolvedValue({
      uuid: INTAKE_UUID,
      conversation_id: null,
      triage_status: 'accepted',
      triage_reason: null,
      triage_decided_at: new Date('2024-01-02T00:00:00.000Z'),
    });

    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/triage`, {
      method: 'PATCH',
      headers: { ...humanHeaders('ext-org-1'), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.status).toBe(200);
    expect(updateIntakeTriageStatus).toHaveBeenCalledWith(
      { uuid: INTAKE_UUID, data: { status: 'accepted' } },
      expect.any(Object)
    );
  });

  it('requires a reason when declining (mirrors the owning schema superRefine)', async () => {
    const res = await krabiclawIntegrationApp.request(`/intakes/${INTAKE_UUID}/triage`, {
      method: 'PATCH',
      headers: { ...humanHeaders('ext-org-1'), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'declined' }),
    });

    expect(res.status).toBe(400);
    expect(updateIntakeTriageStatus).not.toHaveBeenCalled();
  });
});

describe('GET /intakes/settings is not captured by GET /intakes/{uuid} (registration-order routing safety)', () => {
  it('resolves the literal "settings" path segment to the settings route, not the uuid-param route', async () => {
    vi.mocked(getIntakeSettings).mockRejectedValue(new HTTPException(404, { message: 'Organization not found' }));

    const res = await krabiclawIntegrationApp.request('/intakes/settings', { headers: humanHeaders('ext-org-1') });

    expect(getIntakeSettings).toHaveBeenCalled();
    expect(getIntakeById).not.toHaveBeenCalled();
    // A UUID-param route would 400 malformed-UUID before reaching any operation; settings does not require a UUID at all.
    expect(res.status).not.toBe(400);
  });
});

describe('response headers (R22)', () => {
  it('every intake facade response carries Cache-Control: no-store, including failures', async () => {
    vi.mocked(getIntakeSettings).mockRejectedValue(new HTTPException(404, { message: 'Organization not found' }));

    const res = await krabiclawIntegrationApp.request('/intakes/settings', { headers: humanHeaders('ext-org-1') });

    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
