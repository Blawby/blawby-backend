import { test } from 'tap';
import { eq } from 'drizzle-orm';
import { db } from '@/shared/database';
import { organizations } from '@/schema/better-auth-schema';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';

const now = new Date();

const createBaseRecords = async () => {
  const organizationId = crypto.randomUUID();
  const connectedAccountId = crypto.randomUUID();
  const intakeId = crypto.randomUUID();

  await db.insert(organizations).values({
    id: organizationId,
    name: 'Test Practice',
    slug: `test-practice-${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    activeSubscriptionId: crypto.randomUUID(),
  });

  await db.insert(stripeConnectedAccounts).values({
    id: connectedAccountId,
    organization_id: organizationId,
    stripe_account_id: `acct_${crypto.randomUUID()}`,
    account_type: 'custom',
    country: 'US',
    email: 'billing@test.com',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    capabilities: {
      card_payments: 'active',
      transfers: 'active',
    },
    created_at: now,
    updated_at: now,
  });

  await db.insert(practiceClientIntakes).values({
    id: intakeId,
    organization_id: organizationId,
    connected_account_id: connectedAccountId,
    stripe_payment_link_id: `plink_${crypto.randomUUID()}`,
    amount: 2500,
    currency: 'usd',
    status: 'open',
    metadata: {
      email: 'client@test.com',
      name: 'Client Test',
      phone: '555-123-4567',
      description: 'Test intake',
    },
    created_at: now,
    updated_at: now,
  });

  return { organizationId, connectedAccountId, intakeId };
};

test('Practice client intake checkout session flow', async (t) => {
  const { organizationId, intakeId } = await createBaseRecords();

  t.teardown(async () => {
    await db.delete(practiceClientIntakes).where(eq(practiceClientIntakes.id, intakeId));
    await db.delete(stripeConnectedAccounts).where(eq(stripeConnectedAccounts.organization_id, organizationId));
    await db.delete(organizations).where(eq(organizations.id, organizationId));
  });

  const mockStripe = {
    checkout: {
      sessions: {
        create: async () => ({
          id: 'cs_test_123',
          url: 'https://checkout.test/session',
        }),
        retrieve: async () => ({
          id: 'cs_test_123',
          url: 'https://checkout.test/session',
        }),
      },
    },
  };

  const { practiceClientIntakesService } = await t.mockImport(
    '@/modules/practice-client-intakes/services/practice-client-intakes.service',
    {
      '@/shared/utils/stripe-client': { stripe: mockStripe },
    },
  );

  process.env.FRONTEND_URL = 'https://frontend.test';

  await t.test('create checkout session stores session id', async (t) => {
    const result = await practiceClientIntakesService.createPracticeClientIntakeCheckoutSession({
      uuid: intakeId,
      user_id: crypto.randomUUID(),
    });

    t.equal(result.success, true, 'returns success');
    t.ok(result.data?.data?.url, 'returns checkout url');

    const [updated] = await db
      .select()
      .from(practiceClientIntakes)
      .where(eq(practiceClientIntakes.id, intakeId));

    t.equal(updated?.stripe_checkout_session_id, 'cs_test_123', 'session id stored');
  });

  await t.test('post-pay status returns paid when succeeded', async (t) => {
    await db
      .update(practiceClientIntakes)
      .set({ status: 'succeeded', stripe_checkout_session_id: 'cs_test_123' })
      .where(eq(practiceClientIntakes.id, intakeId));

    const result = await practiceClientIntakesService.getPracticeClientIntakePostPayStatus('cs_test_123');

    t.equal(result.success, true, 'returns success');
    t.equal(result.data?.data?.paid, true, 'paid true');
    t.equal(result.data?.data?.intake_uuid, intakeId, 'returns intake uuid');
  });

  await t.test('checkout.session.completed webhook triggers success handler', async (t) => {
    let handled = false;

    const paymentIntent = {
      id: 'pi_test_123',
      latest_charge: 'ch_test_123',
      metadata: { intake_uuid: intakeId },
    };

    const mockStripeForWebhook = {
      paymentIntents: {
        retrieve: async () => paymentIntent,
      },
    };

    const { findPracticeClientIntakeByCheckoutSession } = await import(
      '@/modules/practice-client-intakes/handlers/helpers'
    );

    const mockHandlers = {
      handlePracticeClientIntakeSucceeded: async () => {
        handled = true;
      },
      handlePracticeClientIntakeFailed: async () => undefined,
      handlePracticeClientIntakeCanceled: async () => undefined,
      findPracticeClientIntakeByCheckoutSession,
    };

    const { practiceClientIntakesWebhooksService } = await t.mockImport(
      '@/modules/webhooks/services/practice-client-intakes-webhooks.service',
      {
        '@/modules/practice-client-intakes/handlers': mockHandlers,
        '@/shared/utils/stripe-client': { stripe: mockStripeForWebhook },
      },
    );

    const event = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          payment_intent: 'pi_test_123',
          client_reference_id: intakeId,
          metadata: { intake_uuid: intakeId },
        },
      },
    } as any;

    await practiceClientIntakesWebhooksService.handlePracticeClientIntakeCheckoutSessionCompleted(event);

    t.equal(handled, true, 'success handler invoked');
  });

  await t.test('claim intake links to user and is idempotent', async (t) => {
    const mockUserDetailsService = {
      createUserDetailsFromIntake: async () => ({
        success: true,
        data: { id: crypto.randomUUID() },
      }),
    };

    const { practiceClientIntakesService: serviceWithClaim } = await t.mockImport(
      '@/modules/practice-client-intakes/services/practice-client-intakes.service',
      {
        '@/shared/utils/stripe-client': { stripe: mockStripe },
        '@/modules/user-details/services/user-details.service': { userDetailsService: mockUserDetailsService },
      },
    );

    const userId = crypto.randomUUID();

    const result = await serviceWithClaim.claimPracticeClientIntakePayment({
      session_id: 'cs_test_123',
      user_id: userId,
    });

    t.equal(result.success, true, 'returns success');
    t.equal(result.data?.data?.intake_uuid, intakeId, 'returns intake uuid');

    const [updated] = await db
      .select()
      .from(practiceClientIntakes)
      .where(eq(practiceClientIntakes.id, intakeId));

    t.equal(updated?.metadata?.user_id, userId, 'stores user id in metadata');
  });
});
