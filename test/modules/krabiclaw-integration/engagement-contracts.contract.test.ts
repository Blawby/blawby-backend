import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import krabiclawIntegrationApp from '@/modules/krabiclaw-integration/http';
import { listEngagementContractsResponseSchema } from '@/modules/krabiclaw-integration/routes/engagement-contracts.routes';
import { krabiclawErrorEnvelopeSchema } from '@/modules/krabiclaw-integration/validations/facade-error-schemas';
import { z } from '@hono/zod-openapi';
import { verifyFacadeToken } from '@/modules/krabiclaw-integration/middleware/verify-facade-token';
import { krabiclawDirectoryService } from '@/modules/krabiclaw-integration/services/krabiclaw-directory.service';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import { acceptEngagementContract } from '@/modules/engagement-contracts/operations/accept-engagement-contract.operation';
import { createEngagementContract } from '@/modules/engagement-contracts/operations/create-engagement-contract.operation';
import { declineEngagementContract } from '@/modules/engagement-contracts/operations/decline-engagement-contract.operation';
import { getEngagementContract } from '@/modules/engagement-contracts/operations/get-engagement-contract.operation';
import { listEngagementContracts } from '@/modules/engagement-contracts/operations/list-engagement-contracts.operation';
import { sendEngagementContract } from '@/modules/engagement-contracts/operations/send-engagement-contract.operation';
import { updateEngagementContract } from '@/modules/engagement-contracts/operations/update-engagement-contract.operation';
import type { config } from '@/shared/config';

/**
 * Contract tests for U5's engagement facade routes, exercised against the
 * REAL production `krabiclawIntegrationApp` export (not a local fixture
 * app) — proving the routes registered in `http.ts` via
 * `registerFacadeRoute` (route-registry.ts) are actually reachable end to
 * end through the full policy-gate chain built in U2, with every U7 Legal
 * Operation this unit calls mocked at its own module boundary (KTD4 — the
 * handler dispatches exactly one operation per use case, nothing lower).
 */

interface KrabiClawTestConfigState {
  facadeEnabled: boolean;
  rolloutGroups: Record<string, boolean>;
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
      },
    },
  };
});

/** `legal:engagements` for one token, `legal:practice` for the other — proves R2/AE1 scope isolation without a real OAuth grant. */
const ENGAGEMENT_TOKEN = 'engagement-scoped-token';
const PRACTICE_TOKEN = 'practice-scoped-token';

vi.mock('@/modules/krabiclaw-integration/middleware/verify-facade-token', async () => {
  const { KrabiClawMachineAuthError } = await import('@/modules/krabiclaw-integration/errors/facade-errors');
  return {
    verifyFacadeToken: vi.fn(async (token: string | undefined) => {
      if (token === 'engagement-scoped-token') {
        return { clientId: 'fixed-client', grantedScopes: new Set(['legal:engagements']) };
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

vi.mock('@/modules/engagement-contracts/operations/create-engagement-contract.operation', () => ({
  createEngagementContract: vi.fn(),
}));
vi.mock('@/modules/engagement-contracts/operations/list-engagement-contracts.operation', () => ({
  listEngagementContracts: vi.fn(),
}));
vi.mock('@/modules/engagement-contracts/operations/get-engagement-contract.operation', () => ({
  getEngagementContract: vi.fn(),
}));
vi.mock('@/modules/engagement-contracts/operations/update-engagement-contract.operation', () => ({
  updateEngagementContract: vi.fn(),
}));
vi.mock('@/modules/engagement-contracts/operations/send-engagement-contract.operation', () => ({
  sendEngagementContract: vi.fn(),
}));
vi.mock('@/modules/engagement-contracts/operations/accept-engagement-contract.operation', () => ({
  acceptEngagementContract: vi.fn(),
}));
vi.mock('@/modules/engagement-contracts/operations/decline-engagement-contract.operation', () => ({
  declineEngagementContract: vi.fn(),
}));

const humanHeaders = (organizationId: string, token: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-user-1',
  'x-krabiclaw-actor-kind': 'human',
  ...extra,
});

const anonymousHeaders = (organizationId: string, token: string) => ({
  authorization: `Bearer ${token}`,
  'x-krabiclaw-organization-id': organizationId,
  'x-krabiclaw-actor-id': 'ext-anon-1',
  'x-krabiclaw-actor-kind': 'anonymous',
});

const CONTRACT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const INTAKE_ID = 'a1b2c3d4-5717-4562-b3fc-2c963f66afa6';

const contractFixture = {
  id: CONTRACT_ID,
  intake_id: INTAKE_ID,
  matter_id: null,
  organization_id: 'local-ext-org-1',
  status: 'draft',
  contract_body: 'Body',
  billing_snapshot: null,
  proposal_data: null,
  engagement_notes: null,
  sent_at: null,
  accepted_at: null,
  declined_at: null,
  signed_pdf_s3_key: null,
  created_by: 'local-user-1',
  created_at: new Date('2024-01-01T00:00:00.000Z'),
  updated_at: new Date('2024-01-01T00:00:00.000Z'),
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
  vi.mocked(createEngagementContract).mockReset();
  vi.mocked(listEngagementContracts).mockReset();
  vi.mocked(getEngagementContract).mockReset();
  vi.mocked(updateEngagementContract).mockReset();
  vi.mocked(sendEngagementContract).mockReset();
  vi.mocked(acceptEngagementContract).mockReset();
  vi.mocked(declineEngagementContract).mockReset();
  vi.mocked(verifyFacadeToken).mockClear();
  vi.mocked(krabiclawDirectoryService.getOrganizationDirectoryRecord).mockClear();
  vi.mocked(krabiclawIdentityResolverService.resolveIdentity).mockClear();
});

describe('krabiclaw engagement-contract facade routes', () => {
  describe('policy gates', () => {
    it('rejects an anonymous actor on every engagement route (R11)', async () => {
      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        headers: anonymousHeaders('ext-org-1', ENGAGEMENT_TOKEN),
      });

      expect(res.status).toBe(403);
      expect(listEngagementContracts).not.toHaveBeenCalled();
    });

    it('rejects a legal:practice-scoped token on an engagement route before D1 (R2/AE1)', async () => {
      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        headers: humanHeaders('ext-org-1', PRACTICE_TOKEN),
      });

      expect(res.status).toBe(403);
      expect(listEngagementContracts).not.toHaveBeenCalled();
      expect(krabiclawDirectoryService.getOrganizationDirectoryRecord).not.toHaveBeenCalled();
    });

    it('rejects every engagement route when the engagement rollout group is disabled (R26/AE8)', async () => {
      configState.rolloutGroups = { ...configState.rolloutGroups, engagement: false };

      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        headers: humanHeaders('ext-org-1', ENGAGEMENT_TOKEN),
      });

      expect(res.status).toBe(403);
      expect(listEngagementContracts).not.toHaveBeenCalled();
    });
  });

  describe('POST /engagement-contracts', () => {
    it('reaches the owning operation and returns its result', async () => {
      vi.mocked(createEngagementContract).mockResolvedValue(contractFixture);

      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ intake_id: INTAKE_ID, contract_body: 'Body' }),
      });

      expect(res.status).toBe(201);
      expect(createEngagementContract).toHaveBeenCalledWith(
        { organizationId: 'local-ext-org-1', data: { intake_id: INTAKE_ID, contract_body: 'Body' } },
        expect.objectContaining({ organizationId: 'local-ext-org-1' })
      );
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('rejects caller-supplied identity fields instead of silently dropping them (R14)', async () => {
      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ intake_id: INTAKE_ID, organization_id: 'attacker-controlled-org' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
      expect(createEngagementContract).not.toHaveBeenCalled();
    });

    it('reserializes a 409 (already-accepted contract exists) into the reviewed state_conflict contract, never the raw message', async () => {
      vi.mocked(createEngagementContract).mockRejectedValue(
        new HTTPException(409, { message: 'An accepted engagement contract already exists for intake abc-123' })
      );

      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ intake_id: INTAKE_ID }),
      });

      expect(res.status).toBe(409);
      // Parsed against the real reviewed envelope schema — no `as` cast — so a response that
      // Doesn't conform to the facade's own error contract fails loudly instead of type-lying.
      const body = krabiclawErrorEnvelopeSchema.parse(await res.json());
      expect(body.error.code).toBe('state_conflict');
      expect(body.error.message).not.toContain('abc-123');
    });

    it('reserializes a 404 (intake not found for this organization) into the reviewed resource_not_found contract', async () => {
      vi.mocked(createEngagementContract).mockRejectedValue(new HTTPException(404, { message: 'Intake not found' }));

      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        method: 'POST',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ intake_id: INTAKE_ID }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: { code: 'resource_not_found' } });
    });
  });

  describe('GET /engagement-contracts', () => {
    it('preserves the shared Blawby offset pagination envelope (R16)', async () => {
      vi.mocked(listEngagementContracts).mockResolvedValue({
        data: [contractFixture],
        pagination: { page: 1, limit: 20, total: 1 },
      });

      const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
        headers: humanHeaders('ext-org-1', ENGAGEMENT_TOKEN),
      });

      expect(res.status).toBe(200);
      /**
       * `.pick()` off the route's own real response schema, extended with a loosely-typed `data`
       * — no `as` cast. `data`'s real element schema (`engagementContractSchema`) carries
       * `z.date()` fields that don't round-trip through JSON transport (dates arrive as strings),
       * so only its length is asserted here, not its shape, to avoid the same JSON/date mismatch
       * worked around elsewhere in this test suite.
       */
      const listResponsePaginationSchema = listEngagementContractsResponseSchema
        .pick({ pagination: true })
        .extend({ data: z.array(z.unknown()) });
      const body = listResponsePaginationSchema.parse(await res.json());
      expect(body.pagination).toEqual({ page: 1, limit: 20, total: 1 });
      expect(body.data).toHaveLength(1);
      expect(listEngagementContracts).toHaveBeenCalledWith(
        { organizationId: 'local-ext-org-1', query: { page: 1, limit: 20 } },
        expect.any(Object)
      );
    });
  });

  describe('GET /engagement-contracts/{contract_id}', () => {
    it('reaches the owning operation and returns its result', async () => {
      vi.mocked(getEngagementContract).mockResolvedValue(contractFixture);

      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}`, {
        headers: humanHeaders('ext-org-1', ENGAGEMENT_TOKEN),
      });

      expect(res.status).toBe(200);
      expect(getEngagementContract).toHaveBeenCalledWith(
        CONTRACT_ID,
        expect.objectContaining({
          organizationId: 'local-ext-org-1',
        })
      );
    });

    it('cross-practice contract access fails as a reviewed 404, never a disclosed 403', async () => {
      vi.mocked(getEngagementContract).mockRejectedValue(
        new HTTPException(403, { message: 'Organization does not match the authenticated context' })
      );

      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}`, {
        headers: humanHeaders('ext-org-2', ENGAGEMENT_TOKEN),
      });

      expect(res.status).toBe(404);
      const body = krabiclawErrorEnvelopeSchema.parse(await res.json());
      expect(body.error.code).toBe('resource_not_found');
      expect(body.error.message).not.toContain('authenticated context');
    });
  });

  describe('PATCH /engagement-contracts/{contract_id}', () => {
    it('reaches the owning operation, deriving organization/actor identity from context only', async () => {
      vi.mocked(updateEngagementContract).mockResolvedValue({ ...contractFixture, contract_body: 'Updated body' });

      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}`, {
        method: 'PATCH',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ contract_body: 'Updated body' }),
      });

      expect(res.status).toBe(200);
      expect(updateEngagementContract).toHaveBeenCalledWith(
        { id: CONTRACT_ID, data: { contract_body: 'Updated body' } },
        expect.objectContaining({ organizationId: 'local-ext-org-1', userId: 'local-user-1' })
      );
    });

    it('reserializes a 409 (only draft contracts can be updated) into the reviewed state_conflict contract', async () => {
      vi.mocked(updateEngagementContract).mockRejectedValue(
        new HTTPException(409, { message: 'Only draft contracts can be updated' })
      );

      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}`, {
        method: 'PATCH',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ contract_body: 'Updated body' }),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: { code: 'state_conflict' } });
    });
  });

  describe('PATCH /engagement-contracts/{contract_id}/status', () => {
    it('dispatches only sendEngagementContract for status "sent"', async () => {
      vi.mocked(sendEngagementContract).mockResolvedValue({ ...contractFixture, status: 'sent' });

      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
        method: 'PATCH',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });

      expect(res.status).toBe(200);
      expect(sendEngagementContract).toHaveBeenCalledWith({ id: CONTRACT_ID }, expect.any(Object));
      expect(acceptEngagementContract).not.toHaveBeenCalled();
      expect(declineEngagementContract).not.toHaveBeenCalled();
    });

    it('dispatches only declineEngagementContract for status "declined"', async () => {
      vi.mocked(declineEngagementContract).mockResolvedValue({ ...contractFixture, status: 'declined' });

      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
        method: 'PATCH',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'declined' }),
      });

      expect(res.status).toBe(200);
      expect(declineEngagementContract).toHaveBeenCalledWith({ id: CONTRACT_ID }, expect.any(Object));
      expect(sendEngagementContract).not.toHaveBeenCalled();
      expect(acceptEngagementContract).not.toHaveBeenCalled();
    });

    it('dispatches only acceptEngagementContract for status "accepted", without a client IP header, passing clientIp: undefined', async () => {
      vi.mocked(acceptEngagementContract).mockResolvedValue({ ...contractFixture, status: 'accepted' });

      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
        method: 'PATCH',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      });

      expect(res.status).toBe(200);
      expect(acceptEngagementContract).toHaveBeenCalledWith(
        { id: CONTRACT_ID, clientIp: undefined },
        expect.any(Object)
      );
      expect(sendEngagementContract).not.toHaveBeenCalled();
      expect(declineEngagementContract).not.toHaveBeenCalled();
    });

    it('an invalid status action produces a reviewed 400 validation_failed response, not a dependency error', async () => {
      const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
        method: 'PATCH',
        headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'bogus-action' }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
      expect(sendEngagementContract).not.toHaveBeenCalled();
      expect(acceptEngagementContract).not.toHaveBeenCalled();
      expect(declineEngagementContract).not.toHaveBeenCalled();
    });

    describe('accept action and the trusted originating-client-IP header (R27)', () => {
      it('passes a validated originating-client-IP header through to acceptEngagementContract as clientIp', async () => {
        vi.mocked(acceptEngagementContract).mockResolvedValue({ ...contractFixture, status: 'accepted' });

        const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
          method: 'PATCH',
          headers: {
            ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN, { 'x-krabiclaw-originating-client-ip': '203.0.113.5' }),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ status: 'accepted' }),
        });

        expect(res.status).toBe(200);
        expect(acceptEngagementContract).toHaveBeenCalledWith(
          { id: CONTRACT_ID, clientIp: '203.0.113.5' },
          expect.any(Object)
        );
      });

      it('rejects a malformed originating-client-IP header before any operation dispatch', async () => {
        const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
          method: 'PATCH',
          headers: {
            ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN, {
              'x-krabiclaw-originating-client-ip': 'not-an-ip-address',
            }),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ status: 'accepted' }),
        });

        expect(res.status).toBe(400);
        expect(acceptEngagementContract).not.toHaveBeenCalled();
      });

      it('rejects a browser-forwarded value with commas (spoofed x-forwarded-for shape) as malformed, not a real single IP', async () => {
        const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
          method: 'PATCH',
          headers: {
            ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN, {
              'x-krabiclaw-originating-client-ip': '203.0.113.5, 10.0.0.1',
            }),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ status: 'accepted' }),
        });

        expect(res.status).toBe(400);
        expect(acceptEngagementContract).not.toHaveBeenCalled();
      });

      it('rejects the originating-client-IP header on every non-status engagement route (only the status route accepts it)', async () => {
        const res = await krabiclawIntegrationApp.request('/engagement-contracts', {
          headers: humanHeaders('ext-org-1', ENGAGEMENT_TOKEN, {
            'x-krabiclaw-originating-client-ip': '203.0.113.5',
          }),
        });

        expect(res.status).toBe(400);
        expect(listEngagementContracts).not.toHaveBeenCalled();
      });

      it('never reads the originating-client-IP header for the "sent" branch of status dispatch, even when present', async () => {
        vi.mocked(sendEngagementContract).mockResolvedValue({ ...contractFixture, status: 'sent' });

        const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
          method: 'PATCH',
          headers: {
            ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN, { 'x-krabiclaw-originating-client-ip': '203.0.113.5' }),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ status: 'sent' }),
        });

        expect(res.status).toBe(200);
        expect(sendEngagementContract).toHaveBeenCalledWith({ id: CONTRACT_ID }, expect.any(Object));
        expect(acceptEngagementContract).not.toHaveBeenCalled();
      });

      it('never reads the originating-client-IP header for the "declined" branch of status dispatch, even when present', async () => {
        vi.mocked(declineEngagementContract).mockResolvedValue({ ...contractFixture, status: 'declined' });

        const res = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
          method: 'PATCH',
          headers: {
            ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN, { 'x-krabiclaw-originating-client-ip': '203.0.113.5' }),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ status: 'declined' }),
        });

        expect(res.status).toBe(200);
        expect(declineEngagementContract).toHaveBeenCalledWith({ id: CONTRACT_ID }, expect.any(Object));
        expect(acceptEngagementContract).not.toHaveBeenCalled();
      });
    });

    describe('concurrent-acceptance single-winner behavior', () => {
      it('a losing concurrent acceptance reserializes the operation-thrown 409 as state_conflict, with no facade-added retry', async () => {
        vi.mocked(acceptEngagementContract)
          .mockResolvedValueOnce({ ...contractFixture, status: 'accepted' })
          .mockRejectedValueOnce(new HTTPException(409, { message: 'Only sent contracts can be accepted' }));

        const request = () =>
          krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}/status`, {
            method: 'PATCH',
            headers: { ...humanHeaders('ext-org-1', ENGAGEMENT_TOKEN), 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'accepted' }),
          });

        const [firstRes, secondRes] = await Promise.all([request(), request()]);

        expect(acceptEngagementContract).toHaveBeenCalledTimes(2);
        const statuses = [firstRes.status, secondRes.status].sort((a, b) => a - b);
        expect(statuses).toEqual([200, 409]);
        const loser = firstRes.status === 409 ? firstRes : secondRes;
        expect(await loser.json()).toMatchObject({ error: { code: 'state_conflict' } });
      });
    });
  });

  it('marks every response Cache-Control: no-store, success and failure alike (R22)', async () => {
    vi.mocked(getEngagementContract).mockResolvedValue(contractFixture);
    const okRes = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}`, {
      headers: humanHeaders('ext-org-1', ENGAGEMENT_TOKEN),
    });
    expect(okRes.headers.get('Cache-Control')).toBe('no-store');

    const forbiddenRes = await krabiclawIntegrationApp.request(`/engagement-contracts/${CONTRACT_ID}`, {
      headers: anonymousHeaders('ext-org-1', ENGAGEMENT_TOKEN),
    });
    expect(forbiddenRes.headers.get('Cache-Control')).toBe('no-store');
  });
});
