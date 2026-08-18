import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import onboardingApp from '@/modules/onboarding/http';
import { authHelpers } from '@/test/helpers/auth';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';
import { requireAuth } from '@/shared/middleware/auth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { StripeConnectedAccountCreated } from '@/shared/events/definitions';

// Narrow local shape for exactly the Stripe Account fields the code under test reads — avoids `as unknown as` against the full Stripe SDK type in every mock.
interface MockStripeAccount {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  business_type: null;
  company: null;
  individual: null;
  requirements: null;
  capabilities: null;
  external_accounts: null;
  future_requirements: null;
  tos_acceptance: null;
  metadata: null;
}

interface MockStripeAccountLink {
  url: string;
  expires_at: number;
}

interface MockCreateAccountParams {
  email: string;
  country: string;
}

interface MockCreateAccountOptions {
  idempotencyKey?: string;
}

interface MockCreateAccountLinkParams {
  account: string;
  refresh_url: string;
  return_url: string;
}

// `vi.mock` is hoisted above everything, including plain top-level consts — vi.hoisted() defers these mock functions' creation to run alongside that hoisting so the factory below can see them.
const { mockAccountsCreate, mockAccountLinksCreate } = vi.hoisted(() => ({
  mockAccountsCreate:
    vi.fn<(params: MockCreateAccountParams, options?: MockCreateAccountOptions) => Promise<MockStripeAccount>>(),
  mockAccountLinksCreate: vi.fn<(params: MockCreateAccountLinkParams) => Promise<MockStripeAccountLink>>(),
}));

// Mock Stripe to prevent real API calls — vi.mock calls are hoisted above every import automatically.
vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    accounts: { create: mockAccountsCreate },
    accountLinks: { create: mockAccountLinksCreate },
  },
}));

const mockedStripeAccount = (id: string): MockStripeAccount => ({
  id,
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
  business_type: null,
  company: null,
  individual: null,
  requirements: null,
  capabilities: null,
  external_accounts: null,
  future_requirements: null,
  tos_acceptance: null,
  metadata: null,
});

const app = new Hono();
app.use('/api/*', requireAuth(), requireOrgMembership());
app.route('/api/onboarding', onboardingApp);
const request = createRequest(app.fetch);

describe('Onboarding Connect routes (characterization)', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let sessionToken = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    // StripeConnectedAccountCreated dispatches transactionally onto Graphile Worker, which is not provisioned in the test database — stub it out like practice.test.ts does for its events.
    vi.spyOn(StripeConnectedAccountCreated, 'dispatch').mockResolvedValue('test-event-id');
    ({ org, sessionToken } = await authHelpers.createTestContext('owner'));
  });

  it('GET /organization/:practice_id/status returns not-started defaults when no account exists', async () => {
    const authed = createAuthenticatedRequest(app.fetch, sessionToken);
    const res = await authed.get(`/api/onboarding/organization/${org.id}/status`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      practice_uuid: org.id,
      connected_account_id: null,
      stripe_account_id: null,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });
  });

  it('GET /organization/:practice_id/status rejects unauthenticated requests', async () => {
    const res = await request.get(`/api/onboarding/organization/${org.id}/status`);
    expect(res.status).toBe(401);
  });

  it('POST /connected-accounts creates a Stripe account and returns the hosted onboarding URL', async () => {
    mockAccountsCreate.mockResolvedValueOnce(mockedStripeAccount('acct_test_1'));
    mockAccountLinksCreate.mockResolvedValueOnce({
      url: 'https://connect.stripe.com/setup/s/test',
      expires_at: 1700000000,
    });

    const authed = createAuthenticatedRequest(app.fetch, sessionToken);
    const res = await authed.post('/api/onboarding/connected-accounts').send({
      practice_email: 'practice@example.com',
      practice_uuid: org.id,
      refresh_url: 'https://app.blawby.com/onboarding/refresh',
      return_url: 'https://app.blawby.com/onboarding/return',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      practice_uuid: org.id,
      stripe_account_id: 'acct_test_1',
      url: 'https://connect.stripe.com/setup/s/test',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });
    expect(res.body.connected_account_id).toEqual(expect.any(String));
    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
    expect(mockAccountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'practice@example.com', country: 'US' }),
      undefined
    );
  });

  it('POST /connected-accounts is idempotent-by-organization: a second call reuses the existing account', async () => {
    mockAccountsCreate.mockResolvedValueOnce(mockedStripeAccount('acct_test_2'));
    mockAccountLinksCreate.mockResolvedValue({
      url: 'https://connect.stripe.com/setup/s/test',
      expires_at: 1700000000,
    });

    const authed = createAuthenticatedRequest(app.fetch, sessionToken);
    const body = {
      practice_email: 'practice@example.com',
      practice_uuid: org.id,
      refresh_url: 'https://app.blawby.com/onboarding/refresh',
      return_url: 'https://app.blawby.com/onboarding/return',
    };

    const first = await authed.post('/api/onboarding/connected-accounts').send(body);
    const second = await authed.post('/api/onboarding/connected-accounts').send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.stripe_account_id).toBe('acct_test_2');
    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
    expect(mockAccountLinksCreate).toHaveBeenCalledTimes(2);
  });
});
