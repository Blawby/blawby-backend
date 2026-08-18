import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnectedAccount } from '@/modules/onboarding/operations/create-connected-account.operation';
import { krabiclawConnectOperationsRepository } from '@/modules/onboarding/database/queries/krabiclaw-connect-operations.repository';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { authHelpers } from '@/test/helpers/auth';
import { StripeConnectedAccountCreated } from '@/shared/events/definitions';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { TestOrganization } from '@/test/types/shared';

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

interface MockCreateAccountOptions {
  idempotencyKey?: string;
}

interface MockCreateAccountParams {
  email: string;
  country: string;
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

class StripeClientError extends Error {
  statusCode: number;
  type = 'StripeInvalidRequestError';
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

class StripeMissingAccountError extends StripeClientError {
  constructor() {
    super('The provided key does not have access to account: does not exist', 404);
  }
}

class StripeServerError extends Error {
  statusCode = 500;
  type = 'StripeAPIError';
  constructor() {
    super('stripe unavailable');
  }
}

class StripeRateLimitError extends Error {
  statusCode = 429;
  type = 'StripeRateLimitError';
  constructor() {
    super('too many requests');
  }
}

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

const mockedAccountLink = (): MockStripeAccountLink => ({
  url: 'https://connect.stripe.com/setup/s/test',
  expires_at: 1700000000,
});

describe('createConnectedAccount operation — Connect recovery arm (R42)', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let ctx: LegalOperationContext = { organizationId: '', userId: null };

  beforeEach(async () => {
    vi.resetAllMocks();
    // StripeConnectedAccountCreated dispatches fire-and-forget onto Graphile Worker, which is not provisioned in the test database — stub it out like practice.test.ts does, re-applied every test since vi.resetAllMocks() above wipes it.
    vi.spyOn(StripeConnectedAccountCreated, 'dispatch').mockResolvedValue('test-event-id');
    org = await authHelpers.createTestOrganization();
    ctx = { organizationId: org.id, userId: randomUUID() };
  });

  const params = () => ({
    organizationId: org.id,
    email: 'practice@example.com',
    refreshUrl: 'https://app.blawby.com/onboarding/refresh',
    returnUrl: 'https://app.blawby.com/onboarding/return',
  });

  it('rejects when the context organization does not match the requested organization (tenant isolation)', async () => {
    const otherOrg = await authHelpers.createTestOrganization();
    const mismatchedCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: ctx.userId };

    await expect(createConnectedAccount(params(), mismatchedCtx)).rejects.toMatchObject({ status: 403 });
    expect(mockAccountsCreate).not.toHaveBeenCalled();
  });

  it('succeeds with no D1/directory dependency configured — Legal Operations are auth-independent (KTD22)', async () => {
    mockAccountsCreate.mockResolvedValueOnce(mockedStripeAccount('acct_no_d1'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    // No krabiclaw-integration D1 directory service is imported, mocked, or reachable from this test — the operation must not depend on it (integration-only concerns stay in the facade middleware, not in the domain-owned Legal Operation).
    const result = await createConnectedAccount(params(), ctx);
    expect(result.stripe_account_id).toBe('acct_no_d1');
  });

  it('calls Stripe exactly once and returns a fresh url when the same requestKey is retried', async () => {
    mockAccountsCreate.mockResolvedValueOnce(mockedStripeAccount('acct_recovery_1'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    const requestKey = randomUUID();

    const first = await createConnectedAccount({ ...params(), requestKey }, ctx);
    const second = await createConnectedAccount({ ...params(), requestKey }, ctx);

    expect(first.stripe_account_id).toBe('acct_recovery_1');
    expect(second.stripe_account_id).toBe('acct_recovery_1');
    expect(second.connected_account_id).toBe(first.connected_account_id);
    expect(second.url).toBe('https://connect.stripe.com/setup/s/test');
    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
    // Each replay still gets a live onboarding link — regenerated, not persisted-and-stale.
    expect(mockAccountLinksCreate).toHaveBeenCalledTimes(2);

    const operation = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(operation?.status).toBe('succeeded');
  });

  it('calls Stripe exactly once when the same requestKey is retried concurrently', async () => {
    mockAccountsCreate.mockResolvedValueOnce(mockedStripeAccount('acct_concurrent'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    const requestKey = randomUUID();

    const [first, second] = await Promise.all([
      createConnectedAccount({ ...params(), requestKey }, ctx),
      createConnectedAccount({ ...params(), requestKey }, ctx),
    ]);

    expect(first.connected_account_id).toBe(second.connected_account_id);
    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
  });

  it('marks the operation permanently failed on a client (4xx) Stripe error and does not retry it', async () => {
    mockAccountsCreate.mockRejectedValueOnce(new StripeClientError('invalid email', 400));

    const requestKey = randomUUID();

    await expect(createConnectedAccount({ ...params(), requestKey }, ctx)).rejects.toThrow('invalid email');

    const operation = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(operation?.status).toBe('failed');
    expect(operation?.error_message).toBe('invalid email');

    // A second attempt under the same (now-failed) requestKey surfaces the terminal failure instead of re-attempting Stripe — recovery replays pending/succeeded operations, not failed ones (KrabiClaw must mint a new request key to try again).
    await expect(createConnectedAccount({ ...params(), requestKey }, ctx)).rejects.toThrow('invalid email');
    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
  });

  it('leaves the operation pending (not permanently failed) on an ambiguous/transient Stripe error, and a retry succeeds', async () => {
    mockAccountsCreate
      .mockRejectedValueOnce(new StripeServerError())
      .mockResolvedValueOnce(mockedStripeAccount('acct_after_retry'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    const requestKey = randomUUID();

    await expect(createConnectedAccount({ ...params(), requestKey }, ctx)).rejects.toThrow('stripe unavailable');

    const afterFirstAttempt = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(afterFirstAttempt?.status).toBe('pending');

    const retried = await createConnectedAccount({ ...params(), requestKey }, ctx);
    expect(retried.stripe_account_id).toBe('acct_after_retry');
    expect(mockAccountsCreate).toHaveBeenCalledTimes(2);

    const afterRetry = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(afterRetry?.status).toBe('succeeded');
  });

  it('leaves the operation pending (not permanently failed) on a Stripe 429 rate-limit error, and a retry succeeds', async () => {
    mockAccountsCreate
      .mockRejectedValueOnce(new StripeRateLimitError())
      .mockResolvedValueOnce(mockedStripeAccount('acct_after_rate_limit'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    const requestKey = randomUUID();

    await expect(createConnectedAccount({ ...params(), requestKey }, ctx)).rejects.toThrow('too many requests');

    const afterFirstAttempt = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(afterFirstAttempt?.status).toBe('pending');

    const retried = await createConnectedAccount({ ...params(), requestKey }, ctx);
    expect(retried.stripe_account_id).toBe('acct_after_rate_limit');
    expect(mockAccountsCreate).toHaveBeenCalledTimes(2);
  });

  it('creates separate accounts when the same requestKey is used under different organizations', async () => {
    const otherOrg = await authHelpers.createTestOrganization();
    const otherCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

    mockAccountsCreate
      .mockResolvedValueOnce(mockedStripeAccount('acct_org_a'))
      .mockResolvedValueOnce(mockedStripeAccount('acct_org_b'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    const requestKey = randomUUID();

    const resultA = await createConnectedAccount({ ...params(), organizationId: org.id, requestKey }, ctx);
    const resultB = await createConnectedAccount(
      { ...params(), organizationId: otherOrg.id, requestKey },
      otherCtx
    );

    expect(resultA.stripe_account_id).toBe('acct_org_a');
    expect(resultB.stripe_account_id).toBe('acct_org_b');
    expect(mockAccountsCreate).toHaveBeenCalledTimes(2);
  });

  it('threads a stable idempotency key through stale-account replacement and does not duplicate on retry', async () => {
    await onboardingRepository.create({
      organization_id: org.id,
      stripe_account_id: 'acct_stale',
      account_type: 'custom',
      country: 'US',
      email: 'practice@example.com',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    });

    // Every accountLinks.create call for the stale account fails until it has been replaced.
    mockAccountLinksCreate.mockRejectedValue(new StripeMissingAccountError());
    mockAccountsCreate.mockResolvedValue(mockedStripeAccount('acct_replacement'));

    const requestKey = randomUUID();

    await expect(createConnectedAccount({ ...params(), requestKey }, ctx)).rejects.toThrow();

    const operation = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(operation?.status).toBe('failed');
    const { calls } = mockAccountsCreate.mock;
    expect(calls).toHaveLength(1);
    const [[, options]] = calls;
    expect(options).toEqual({ idempotencyKey: `krabiclaw-connect:${operation?.id}:replace` });

    // Retrying under the same requestKey after a terminal failure surfaces the persisted error instead of calling Stripe (and therefore the replacement path) again.
    await expect(createConnectedAccount({ ...params(), requestKey }, ctx)).rejects.toThrow();
    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
  });

  it('ignores a retry request body that differs from the original snapshot (R24 — immutable request inputs)', async () => {
    mockAccountsCreate.mockResolvedValueOnce(mockedStripeAccount('acct_snapshot'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    const requestKey = randomUUID();
    await createConnectedAccount({ ...params(), requestKey, email: 'original@example.com' }, ctx);

    // A retry claiming a different email under the same key must not affect the Stripe call — the persisted snapshot from the first request is authoritative.
    await createConnectedAccount({ ...params(), requestKey, email: 'different@example.com' }, ctx);

    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
    expect(mockAccountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'original@example.com' }),
      expect.anything()
    );

    const operation = await krabiclawConnectOperationsRepository.findByRequestKey(org.id, requestKey);
    expect(operation?.email).toBe('original@example.com');
  });

  it('does not write a recovery row and behaves identically to today when no requestKey is supplied', async () => {
    mockAccountsCreate.mockResolvedValueOnce(mockedStripeAccount('acct_no_key'));
    mockAccountLinksCreate.mockResolvedValue(mockedAccountLink());

    const result = await createConnectedAccount(params(), ctx);

    expect(result.stripe_account_id).toBe('acct_no_key');
    expect(mockAccountsCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'practice@example.com' }), undefined);
  });
});
