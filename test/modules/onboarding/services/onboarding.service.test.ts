import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createTestContext } from '@/test/helpers/auth';
import { onboardingService } from '@/modules/onboarding/services/onboarding.service';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { OnboardingStarted } from '@/shared/events/definitions';
import { organizationService } from '@/modules/practice/services/organization.service';
import type { User } from '@/shared/types/BetterAuth';

vi.mock('@/modules/practice/services/organization.service');
vi.mock('@/test/helpers/auth', () => ({
  createTestContext: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
    org: { id: 'test-org-id', name: 'Test Org', slug: 'test-org' },
  }),
}));

vi.mock('@/modules/onboarding/services/connected-accounts.service');
vi.mock('@/modules/onboarding/database/queries/onboarding.repository');
vi.mock('@/shared/events/definitions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/events/definitions')>();
  return {
    ...actual,
    OnboardingStarted: {
      dispatch: vi.fn(),
    },
  };
});

describe('Onboarding Service', () => {
  let user: User;
  let organizationId: string;

  beforeAll(async () => {
    const context = await createTestContext('owner');
    // Map TestUser to User
    user = {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as unknown as User;
    organizationId = context.org.id;

    // Default mock for organization access
    vi.mocked(organizationService.getFullOrganization).mockResolvedValue({
      success: true,
      data: {
        id: organizationId,
        name: context.org.name,
        slug: context.org.slug,
      } as any,
    });
  });

  it('should create an onboarding session successfully', async () => {
    const mockAccount = {
      account_id: 'acct_123',
      url: 'https://stripe.com/onboard/123',
      status: {
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      },
    };

    vi.mocked(connectedAccountsService.createOrGetAccount).mockResolvedValue({
      success: true,
      data: mockAccount,
    } as any);

    const result = await onboardingService.createOnboardingSession({
      organizationEmail: 'test@example.com',
      organizationId,
      user,
      refreshUrl: 'https://example.com/refresh',
      returnUrl: 'https://example.com/return',
      requestHeaders: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe(mockAccount.url);
      expect(result.data.stripe_account_id).toBe(mockAccount.account_id);
    }
    expect(OnboardingStarted.dispatch).toHaveBeenCalled();
  });

  it('should return error if organization access is denied for session creation', async () => {
    vi.mocked(organizationService.getFullOrganization).mockResolvedValueOnce({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });

    const result = await onboardingService.createOnboardingSession({
      organizationEmail: 'test@example.com',
      organizationId: '00000000-0000-0000-0000-000000000000',
      user,
      refreshUrl: 'https://example.com/refresh',
      returnUrl: 'https://example.com/return',
      requestHeaders: {},
    });

    expect(result.success).toBe(false);
  });

  it('should return onboarding status if found', async () => {
    const mockDbAccount = {
      stripe_account_id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    };

    vi.mocked(onboardingRepository.findByOrganizationId).mockResolvedValue(mockDbAccount as any);

    const result = await onboardingService.getOnboardingStatus(organizationId, user, {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stripe_account_id).toBe(mockDbAccount.stripe_account_id);
      expect(result.data.charges_enabled).toBe(true);
    }
  });

  it('should return not found if account does not exist when getting status', async () => {
    vi.mocked(onboardingRepository.findByOrganizationId).mockResolvedValue(null);

    const result = await onboardingService.getOnboardingStatus(organizationId, user, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should create a connected account successfully', async () => {
    const mockAccount = {
      account_id: 'acct_456',
      url: 'https://stripe.com/onboard/456',
      status: {
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      },
    };

    vi.mocked(connectedAccountsService.createOrGetAccount).mockResolvedValue({
      success: true,
      data: mockAccount,
    } as any);

    const result = await onboardingService.createConnectedAccount({
      email: 'org@example.com',
      organizationId,
      user,
      refreshUrl: 'https://example.com/refresh',
      returnUrl: 'https://example.com/return',
      requestHeaders: {},
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stripe_account_id).toBe(mockAccount.account_id);
    }
  });
});
