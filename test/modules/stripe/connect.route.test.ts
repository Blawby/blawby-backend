import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import stripeApp from '@/modules/stripe/http';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { authHelpers } from '@/test/helpers/auth';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';
import { requireAuth } from '@/shared/middleware/auth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';

interface MockAccountSession {
  client_secret: string;
  expires_at: number;
}

// `vi.mock` is hoisted above everything, including plain top-level consts — vi.hoisted() defers this mock function's creation to run alongside that hoisting so the factory below can see it.
const { mockAccountSessionsCreate } = vi.hoisted(() => ({
  mockAccountSessionsCreate: vi.fn<(params: Record<string, unknown>) => Promise<MockAccountSession>>(),
}));

// Mock Stripe to prevent real API calls — vi.mock calls are hoisted above every import automatically.
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    accountSessions: {
      create: mockAccountSessionsCreate,
    },
  },
}));

// Mirror the stripe module middleware (requireAuth + requireOrgMembership, see src/modules/stripe/http.ts).
const app = new Hono();
app.use('/api/*', requireAuth());
app.use('/api/*', requireOrgMembership());
app.route('/api/stripe', stripeApp);
const request = createRequest(app.fetch);

describe('Stripe Connect routes (characterization)', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let sessionToken = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ org, sessionToken } = await authHelpers.createTestContext('owner'));
  });

  it('GET /connect/account/:practice_id returns 404 when no connected account exists', async () => {
    const authed = createAuthenticatedRequest(app.fetch, sessionToken);
    const res = await authed.get(`/api/stripe/connect/account/${org.id}`);
    expect(res.status).toBe(404);
  });

  it('GET /connect/account/:practice_id returns account status when one exists', async () => {
    await onboardingRepository.create({
      organization_id: org.id,
      stripe_account_id: 'acct_existing',
      account_type: 'custom',
      country: 'US',
      email: 'practice@example.com',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });

    const authed = createAuthenticatedRequest(app.fetch, sessionToken);
    const res = await authed.get(`/api/stripe/connect/account/${org.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      account_id: 'acct_existing',
      status: {
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    });
  });

  it('POST /connect/account-session rejects when no connected account exists', async () => {
    const authed = createAuthenticatedRequest(app.fetch, sessionToken);
    const res = await authed.post('/api/stripe/connect/account-session').send({ components: ['payments'] });
    expect(res.status).toBe(404);
  });

  it('POST /connect/account-session creates a session when a connected account exists', async () => {
    await onboardingRepository.create({
      organization_id: org.id,
      stripe_account_id: 'acct_session_test',
      account_type: 'custom',
      country: 'US',
      email: 'practice@example.com',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });

    mockAccountSessionsCreate.mockResolvedValueOnce({
      client_secret: 'accs_secret_test',
      expires_at: 1700000000,
    });

    const authed = createAuthenticatedRequest(app.fetch, sessionToken);
    const res = await authed.post('/api/stripe/connect/account-session').send({ components: ['payments'] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      client_secret: 'accs_secret_test',
      expires_at: 1700000000,
      account_id: 'acct_session_test',
    });
    expect(mockAccountSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ account: 'acct_session_test' }));
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request.get(`/api/stripe/connect/account/${org.id}`);
    expect(res.status).toBe(401);
  });
});
