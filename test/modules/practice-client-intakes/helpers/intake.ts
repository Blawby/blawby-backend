// oxlint-disable typescript/no-unsafe-type-assertion
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { getTestDb } from '@/test/helpers/db';
import { loadStripeFixture } from '@/test/helpers/stripe-fixtures';
import { stripe } from '@/shared/utils/stripe-client';
import {
  practiceClientIntakes,
  type InsertPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { defineAbilityFor } from '@/shared/auth/abilities';
import type { User } from '@/shared/types/BetterAuth';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { stripeConnectedAccounts, type StripeConnectedAccount } from '@/modules/onboarding/schemas/onboarding.schema';
import { organizations, subscriptions } from '@/schema/better-auth-schema';
import type { ServiceContext } from '@/shared/types/service-context';
import type { MemberRole } from '@/modules/practice/types/members.types';

const { signInMagicLinkMock, intakePaymentCreatedDispatchMock } = vi.hoisted(() => ({
  signInMagicLinkMock: vi.fn().mockResolvedValue(undefined),
  intakePaymentCreatedDispatchMock: vi.fn(),
}));

const createStripeResponse = <T extends object>(data: T): Stripe.Response<T> => ({
  ...data,
  lastResponse: {
    headers: {},
    requestId: 'req_test',
    statusCode: 200,
  },
});

const createCheckoutSessionFixture = (overrides?: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session => {
  const fixture = loadStripeFixture<Stripe.Checkout.Session>('checkout-session-open.json');
  return {
    ...fixture,
    ...overrides,
  };
};

const createPaymentLinkFixture = (overrides?: Partial<Stripe.PaymentLink>): Stripe.PaymentLink =>
  ({
    id: 'plink_test_default',
    object: 'payment_link',
    active: true,
    after_completion: { type: 'redirect', redirect: { url: 'http://localhost:3000/success' } },
    allow_promotion_codes: false,
    application: null,
    application_fee_amount: null,
    application_fee_percent: null,
    automatic_tax: { enabled: false, liability: null },
    billing_address_collection: 'auto',
    consent_collection: null,
    currency: 'usd',
    custom_fields: [],
    custom_text: { after_submit: null, shipping_address: null, submit: null, terms_of_approval_acceptance: null },
    customer_creation: 'if_required',
    inactive_message: null,
    invoice_creation: null,
    livemode: false,
    metadata: {},
    on_behalf_of: null,
    payment_intent_data: null,
    payment_method_collection: 'always',
    payment_method_types: null,
    phone_number_collection: { enabled: false },
    restrictions: null,
    shipping_address_collection: null,
    shipping_options: [],
    submit_type: 'pay',
    subscription_data: null,
    tax_id_collection: { enabled: false, required: 'never' },
    transfer_data: null,
    url: 'https://buy.stripe.com/test_default',
    line_items: {
      object: 'list',
      data: [],
      has_more: false,
      url: '/v1/payment_links/plink_test_default/line_items',
    },
    ...overrides,
  }) as Stripe.PaymentLink;

// Mock events to prevent side effects
vi.mock('@/shared/events/definitions', () => ({
  IntakePaymentCreated: {
    dispatch: intakePaymentCreatedDispatchMock,
  },
}));

// Mock Better Auth magic link
vi.mock('@/shared/auth/better-auth', () => ({
  createBetterAuthInstance: vi.fn(() => ({
    api: {
      signInMagicLink: signInMagicLinkMock,
    },
  })),
  signInMagicLink: signInMagicLinkMock,
}));

/**
 * Mock Stripe checkout session retrieve
 *
 * @example
 * ```ts
 * mockStripeSessionRetrieve('cs_test_123', {
 *   payment_status: 'paid',
 *   status: 'complete',
 *   metadata: { intake_uuid: 'uuid-here' },
 * });
 * ```
 */
export const mockStripeSessionRetrieve = (data: {
  id: string;
  paymentStatus: Stripe.Checkout.Session['payment_status'];
  status: Stripe.Checkout.Session['status'];
  metadata?: Record<string, string>;
  url?: string;
}): void => {
  vi.mocked(stripe, true).checkout.sessions.retrieve.mockResolvedValue(
    createStripeResponse(
      createCheckoutSessionFixture({
        id: data.id,
        payment_status: data.paymentStatus,
        status: data.status,
        metadata: data.metadata ?? {},
        ...(data.url ? { url: data.url } : {}),
      })
    )
  );
};

/**
 * Mock Stripe checkout session create
 *
 * @example
 * ```ts
 * mockStripeSessionCreate({
 *   id: 'cs_test_xyz',
 *   url: 'https://checkout.stripe.com/test',
 *   status: 'open',
 * });
 * ```
 */
export const mockStripeSessionCreate = (data: {
  id: string;
  url: string;
  status?: Stripe.Checkout.Session['status'];
  paymentStatus?: Stripe.Checkout.Session['payment_status'];
}): void => {
  vi.mocked(stripe, true).checkout.sessions.create.mockResolvedValue(
    createStripeResponse(
      createCheckoutSessionFixture({
        id: data.id,
        url: data.url,
        status: data.status ?? 'open',
        payment_status: data.paymentStatus ?? 'unpaid',
      })
    )
  );
};

/**
 * Mock Stripe payment link create
 */
export const mockStripePaymentLinkCreate = (data: Partial<Stripe.PaymentLink>): void => {
  vi.mocked(stripe, true).paymentLinks.create.mockResolvedValue(createStripeResponse(createPaymentLinkFixture(data)));
};

/**
 * Create a service context for testing
 */
export const createServiceContext = (
  userId: string,
  organizationId: string,
  role: MemberRole | null = 'member',
  userEmail = 'test@example.com'
): ServiceContext & {
  userEmail: string;
  activeOrganizationId: string;
} => {
  const ability = defineAbilityFor(role ?? 'member');
  return {
    userId,
    user: { id: userId, email: userEmail, name: 'Test User' } as User,
    organizationId,
    userEmail,
    activeOrganizationId: organizationId,
    memberRole: role,
    ability,
    requestHeaders: {},
    emit: vi.fn().mockResolvedValue(''),
  };
};

/**
 * Mock connected account for testing
 */
export const mockConnectedAccount = (overrides?: Partial<StripeConnectedAccount>): StripeConnectedAccount =>
  ({
    id: randomUUID(),
    organization_id: randomUUID(),
    account_type: 'custom',
    country: 'US',
    email: 'test@example.com',
    stripe_account_id: 'acct_test_123',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    capabilities: {
      card_payments: 'active',
      transfers: 'active',
    },
    requirements: null,
    business_type: null,
    company: null,
    individual: null,
    externalAccounts: null,
    futureRequirements: null,
    tosAcceptance: null,
    metadata: null,
    onboarding_completed_at: null,
    last_refreshed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as StripeConnectedAccount;

export const mockStripe = (): void => {
  const m = vi.mocked(stripe, true);
  m.checkout.sessions.create.mockReset();
  m.checkout.sessions.retrieve.mockReset();
  m.paymentLinks.create.mockReset();
  m.checkout.sessions.create.mockResolvedValue(createStripeResponse(createCheckoutSessionFixture()));
  m.checkout.sessions.retrieve.mockResolvedValue(createStripeResponse(createCheckoutSessionFixture()));
  m.paymentLinks.create.mockResolvedValue(createStripeResponse(createPaymentLinkFixture()));
};

export const mockEvents = (): void => {
  intakePaymentCreatedDispatchMock.mockReset();
};

export const mockBetterAuth = (): {
  signInMagicLink: typeof signInMagicLinkMock;
} => ({
  signInMagicLink: signInMagicLinkMock,
});

/**
 * Seed a public intake organization with subscription and connected account
 */
export const seedPublicIntakeOrganization = async (orgId: string): Promise<void> => {
  const db = getTestDb();

  // Create a subscription for the organization
  const subscriptionId = randomUUID();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    plan: 'platform',
    referenceId: orgId,
    status: 'active',
  });

  // Update organization with active subscription ID (Drizzle field name)
  await db.update(organizations).set({ activeSubscriptionId: subscriptionId }).where(eq(organizations.id, orgId));

  // Create a connected Stripe account (use orgId-derived account_id to avoid unique constraint conflicts on re-runs)
  await db.insert(stripeConnectedAccounts).values(
    mockConnectedAccount({
      organization_id: orgId,
      stripe_account_id: `acct_test_${orgId.replace(/-/g, '').slice(0, 16)}`,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    })
  );
};

/**
 * Create a test intake
 */
export const createTestIntake = async (
  orgId: string,
  intake: Partial<InsertPracticeClientIntake>
): Promise<typeof practiceClientIntakes.$inferSelect> => {
  const values = {
    organization_id: orgId,
    amount: 0,
    currency: 'usd',
    status: 'succeeded',
    triage_status: 'pending_review' as const,
    metadata: { email: 'test@example.com', name: 'Test User' },
    ...intake,
  };

  const [result] = await getTestDb().insert(practiceClientIntakes).values(values).returning();
  return result;
};

/**
 * Create multiple test intakes
 */
export const createTestIntakes = async (
  orgId: string,
  intakes: Partial<InsertPracticeClientIntake>[]
): Promise<(typeof practiceClientIntakes.$inferSelect)[]> => {
  const values = intakes.map((intake) => ({
    organization_id: orgId,
    amount: 0,
    currency: 'usd',
    status: 'succeeded',
    triage_status: 'pending_review',
    metadata: { email: 'test@example.com', name: 'Test User' },
    ...intake,
  }));

  return await getTestDb().insert(practiceClientIntakes).values(values).returning();
};

/**
 * Setup onboarding repository mock
 */
export const mockOnboardingRepository = (connectedAccount: ReturnType<typeof mockConnectedAccount> | null) => {
  vi.spyOn(onboardingRepository, 'findByOrganizationId').mockResolvedValue(connectedAccount);
};

/**
 * Common intake metadata patterns
 */
export const IntakeMetadata = {
  basic: (email: string, name: string) => ({ email, name }),
  withPhone: (email: string, name: string, phone: string) => ({ email, name, phone }),
  withUserId: (email: string, name: string, userId: string) => ({ email, name, user_id: userId }),
  full: (email: string, name: string, userId?: string) => ({
    email,
    name,
    phone: '+1234567890',
    on_behalf_of: 'Self',
    opposing_party: 'Opposing Party',
    description: 'Test description',
    ...(userId && { user_id: userId }),
  }),
};

/**
 * Common intake status patterns
 */
export const IntakeStatus = {
  open: 'open',
  succeeded: 'succeeded',
  converted: 'converted',
  expired: 'expired',
  canceled: 'canceled',
} as const;

/**
 * Common triage status patterns
 */
export const TriageStatus = {
  pending: 'pending_review',
  accepted: 'accepted',
  declined: 'declined',
} as const;

/**
 * Common urgency patterns
 */
export const Urgency = {
  routine: 'routine',
  timeSensitive: 'time_sensitive',
  emergency: 'emergency',
} as const;

export const intakeHelpers = {
  mockStripe,
  mockEvents,
  mockBetterAuth,
  createServiceContext,
  mockConnectedAccount,
  seedPublicIntakeOrganization,
  createTestIntake,
  createTestIntakes,
  mockStripeSessionRetrieve,
  mockStripeSessionCreate,
  mockStripePaymentLinkCreate,
  mockOnboardingRepository,
  IntakeMetadata,
  IntakeStatus,
  TriageStatus,
  Urgency,
};
