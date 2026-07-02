import { stripePrices } from '@/modules/subscriptions/database/schema/stripe-prices.schema';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscription-events.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscription-line-items.schema';
import { subscriptions } from '@/modules/subscriptions/database/schema/subscriptions.schema';
import {
  attachMeteredPricesToSubscription,
  handleSubscriptionEvent,
  syncSubscriptionToOrg,
} from '@/modules/subscriptions/services/subscription-lifecycle.service';
import { organizations } from '@/schema/better-auth-schema';
import { events } from '@/shared/events/schemas/events.schema';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import type { TestOrganization } from '@/test/types/shared';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Stripe } from 'stripe';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/utils/stripe-client', () => ({
  getStripeInstance: vi.fn(),
}));

const getStripeInstanceMock = vi.mocked(getStripeInstance);
const subscriptionsRetrieveMock = vi.fn();
const subscriptionsUpdateMock = vi.fn();
const subscriptionsCancelMock = vi.fn();

const db = getTestDb();

const makePrice = (overrides: Partial<Stripe.Price> = {}): Stripe.Price =>
  ({
    id: `price_${randomUUID()}`,
    object: 'price',
    nickname: null,
    product: `prod_${randomUUID()}`,
    unit_amount: 5000,
    recurring: { usage_type: 'licensed' },
    ...overrides,
  }) as unknown as Stripe.Price;

const makeItem = (overrides: Partial<Stripe.SubscriptionItem> = {}): Stripe.SubscriptionItem =>
  ({
    id: `si_${randomUUID()}`,
    price: makePrice(),
    quantity: 1,
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_600_000,
    ...overrides,
  }) as unknown as Stripe.SubscriptionItem;

const makeStripeSubscription = (
  overrides: Partial<Omit<Stripe.Subscription, 'items'>> & { items?: { data: Stripe.SubscriptionItem[] } } = {}
): Stripe.Subscription =>
  ({
    id: `sub_${randomUUID()}`,
    object: 'subscription',
    customer: `cus_${randomUUID()}`,
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    trial_start: null,
    trial_end: null,
    created: 1_699_000_000,
    metadata: {},
    items: { data: [makeItem()] },
    ...overrides,
  }) as unknown as Stripe.Subscription;

const insertSubscriptionRow = async (orgId: string, overrides: Partial<typeof subscriptions.$inferInsert> = {}) => {
  const [row] = await db
    .insert(subscriptions)
    .values({ plan: 'starter', referenceId: orgId, status: 'incomplete', ...overrides })
    .returning();
  return row;
};

const insertStripePrice = async (overrides: Partial<typeof stripePrices.$inferInsert> = {}) => {
  const [row] = await db
    .insert(stripePrices)
    .values({
      stripe_price_id: `price_${randomUUID()}`,
      stripe_product_id: `prod_${randomUUID()}`,
      currency: 'usd',
      unit_amount: 5000,
      usage_type: 'licensed',
      name: 'starter',
      is_active: true,
      ...overrides,
    })
    .returning();
  return row;
};

const getOrg = async (orgId: string) => {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return row;
};

const getSubscription = async (id: string) => {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return row;
};

beforeAll(() => {
  getStripeInstanceMock.mockReturnValue({
    subscriptions: {
      retrieve: subscriptionsRetrieveMock,
      update: subscriptionsUpdateMock,
      cancel: subscriptionsCancelMock,
    },
  } as unknown as ReturnType<typeof getStripeInstance>);
});

beforeEach(() => {
  subscriptionsRetrieveMock.mockReset();
  subscriptionsUpdateMock.mockReset();
  subscriptionsCancelMock.mockReset();
});

describe('syncSubscriptionToOrg', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };

  beforeEach(async () => {
    org = await authHelpers.createTestOrganization();
    await insertStripePrice();
  });

  it('skips when no customer ID can be resolved', async () => {
    const localSub = await insertSubscriptionRow(org.id);
    const stripeSub = makeStripeSubscription({ customer: null as unknown as string });

    await syncSubscriptionToOrg({
      stripeSubscription: stripeSub,
      subscriptionId: localSub.id,
      referenceId: org.id,
      planName: 'starter',
      eventType: 'created',
      trigger: 'webhook',
    });

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBeNull();
  });

  it('syncs subscription fields, line items, and claims the org pointer on first sync', async () => {
    const localSub = await insertSubscriptionRow(org.id);
    const stripeSub = makeStripeSubscription();

    await syncSubscriptionToOrg({
      stripeSubscription: stripeSub,
      subscriptionId: localSub.id,
      referenceId: org.id,
      planName: 'starter',
      eventType: 'created',
      trigger: 'webhook',
    });

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBe(localSub.id);
    expect(updatedOrg.stripeCustomerId).toBe(stripeSub.customer);

    const updatedSub = await getSubscription(localSub.id);
    expect(updatedSub.status).toBe('active');
    expect(updatedSub.stripeSubscriptionId).toBe(stripeSub.id);

    const items = await db
      .select()
      .from(subscriptionLineItems)
      .where(eq(subscriptionLineItems.subscription_id, localSub.id));
    expect(items).toHaveLength(1);
    expect(items[0]?.item_type).toBe('base_fee');

    const auditRows = await db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.subscription_id, localSub.id));
    expect(auditRows.some((e) => e.event_type === 'created')).toBe(true);
  });

  it('dispatches SubscriptionCreated only once across repeated syncs, even though each sync writes its own audit row', async () => {
    const localSub = await insertSubscriptionRow(org.id);
    const stripeSub = makeStripeSubscription();

    const syncOnce = () =>
      syncSubscriptionToOrg({
        stripeSubscription: stripeSub,
        subscriptionId: localSub.id,
        referenceId: org.id,
        planName: 'starter',
        eventType: 'created',
        trigger: 'webhook',
      });

    await syncOnce();
    await syncOnce();

    // Audit log: subscriptionRepository.createEvent() is unconditional, so a 'created' row is written every sync.
    const auditRows = await db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.subscription_id, localSub.id));
    expect(auditRows.filter((e) => e.event_type === 'created')).toHaveLength(2);

    // Outbox dispatch: gated by createdEventInserted, so SubscriptionCreated only fires once.
    const dispatchedEvents = await db
      .select()
      .from(events)
      .where(and(eq(events.type, 'subscription.created'), eq(events.organizationId, org.id)));
    expect(dispatchedEvents).toHaveLength(1);
  });

  it('resolves the organization by stripeCustomerId when referenceId is not provided', async () => {
    await db.update(organizations).set({ stripeCustomerId: 'cus_lookup_1' }).where(eq(organizations.id, org.id));
    const localSub = await insertSubscriptionRow(org.id);
    const stripeSub = makeStripeSubscription({ customer: 'cus_lookup_1' });

    await syncSubscriptionToOrg({
      stripeSubscription: stripeSub,
      subscriptionId: localSub.id,
      referenceId: null,
      planName: 'starter',
      eventType: 'created',
      trigger: 'webhook',
    });

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBe(localSub.id);
  });

  it('cancels the incoming subscription when it is older than the currently active one', async () => {
    const activeSub = await insertSubscriptionRow(org.id, { status: 'active', createdAt: new Date('2026-02-01') });
    await db.update(organizations).set({ activeSubscriptionId: activeSub.id }).where(eq(organizations.id, org.id));

    const incomingSub = await insertSubscriptionRow(org.id, { status: 'incomplete' });
    const stripeSub = makeStripeSubscription({ id: 'sub_incoming_old', created: 1_000_000_000 });

    await syncSubscriptionToOrg({
      stripeSubscription: stripeSub,
      subscriptionId: incomingSub.id,
      referenceId: org.id,
      planName: 'starter',
      eventType: 'created',
      trigger: 'webhook',
    });

    const updatedIncoming = await getSubscription(incomingSub.id);
    expect(updatedIncoming.status).toBe('canceled');
    expect(subscriptionsCancelMock).toHaveBeenCalledWith('sub_incoming_old');

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBe(activeSub.id);
  });

  it('cancels the existing active subscription when the incoming one is newer', async () => {
    const activeSub = await insertSubscriptionRow(org.id, {
      status: 'active',
      stripeSubscriptionId: 'sub_existing_old',
      createdAt: new Date('2026-01-01'),
    });
    await db.update(organizations).set({ activeSubscriptionId: activeSub.id }).where(eq(organizations.id, org.id));

    const incomingSub = await insertSubscriptionRow(org.id, { status: 'incomplete' });
    const stripeSub = makeStripeSubscription({ id: 'sub_incoming_new', created: 2_000_000_000 });

    await syncSubscriptionToOrg({
      stripeSubscription: stripeSub,
      subscriptionId: incomingSub.id,
      referenceId: org.id,
      planName: 'starter',
      eventType: 'created',
      trigger: 'webhook',
    });

    const updatedExisting = await getSubscription(activeSub.id);
    expect(updatedExisting.status).toBe('canceled');
    expect(subscriptionsCancelMock).toHaveBeenCalledWith('sub_existing_old');

    const updatedIncoming = await getSubscription(incomingSub.id);
    expect(updatedIncoming.status).toBe('active');

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBe(incomingSub.id);
  });
});

describe('attachMeteredPricesToSubscription', () => {
  it('attaches metered prices not already on the live subscription', async () => {
    const productId = `prod_${randomUUID()}`;
    const meteredPriceId = `price_${randomUUID()}`;
    await insertStripePrice({
      stripe_price_id: meteredPriceId,
      stripe_product_id: productId,
      usage_type: 'metered',
      is_active: true,
      name: null,
    });
    const stripeSub = makeStripeSubscription({
      items: { data: [makeItem({ price: makePrice({ product: productId }) })] },
    });
    subscriptionsRetrieveMock.mockResolvedValue(stripeSub);

    await attachMeteredPricesToSubscription(stripeSub);

    expect(subscriptionsUpdateMock).toHaveBeenCalledWith(
      stripeSub.id,
      { items: [{ price: meteredPriceId }], proration_behavior: 'none' },
      expect.objectContaining({ idempotencyKey: expect.stringContaining(`attach-metered-${stripeSub.id}`) })
    );
  });

  it('does nothing when there are no metered prices to add', async () => {
    subscriptionsRetrieveMock.mockResolvedValue(
      makeStripeSubscription({ items: { data: [makeItem({ price: makePrice() })] } })
    );

    await attachMeteredPricesToSubscription(makeStripeSubscription());

    expect(subscriptionsUpdateMock).not.toHaveBeenCalled();
  });
});

describe('handleSubscriptionEvent', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };

  beforeEach(async () => {
    org = await authHelpers.createTestOrganization();
    await insertStripePrice();
  });

  const makeEvent = (type: string, object: unknown): Stripe.Event =>
    ({ id: 'evt_test_1', type, data: { object } }) as unknown as Stripe.Event;

  it('claims the org pointer on customer.subscription.updated when the status is entitled', async () => {
    const localSub = await insertSubscriptionRow(org.id, {
      stripeSubscriptionId: 'sub_stripe_1',
      status: 'incomplete',
    });
    const stripeSub = makeStripeSubscription({ status: 'active', metadata: { subscription_id: localSub.id } });

    await handleSubscriptionEvent(makeEvent('customer.subscription.updated', stripeSub));

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBe(localSub.id);
    const updatedSub = await getSubscription(localSub.id);
    expect(updatedSub.status).toBe('active');
  });

  it('clears the org pointer on customer.subscription.updated when the status is not entitled', async () => {
    const localSub = await insertSubscriptionRow(org.id, { stripeSubscriptionId: 'sub_stripe_1', status: 'active' });
    await db.update(organizations).set({ activeSubscriptionId: localSub.id }).where(eq(organizations.id, org.id));
    const stripeSub = makeStripeSubscription({ status: 'canceled', metadata: { subscription_id: localSub.id } });

    await handleSubscriptionEvent(makeEvent('customer.subscription.updated', stripeSub));

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBeNull();
  });

  it('skips customer.subscription.updated when no local subscription is found', async () => {
    const stripeSub = makeStripeSubscription({ id: 'sub_unknown', metadata: {} });

    await expect(
      handleSubscriptionEvent(makeEvent('customer.subscription.updated', stripeSub))
    ).resolves.toBeUndefined();
  });

  it('cancels the subscription and clears the org pointer on customer.subscription.deleted', async () => {
    const localSub = await insertSubscriptionRow(org.id, { stripeSubscriptionId: 'sub_stripe_1', status: 'active' });
    await db.update(organizations).set({ activeSubscriptionId: localSub.id }).where(eq(organizations.id, org.id));
    const stripeSub = makeStripeSubscription({ metadata: { subscription_id: localSub.id } });

    await handleSubscriptionEvent(makeEvent('customer.subscription.deleted', stripeSub));

    const updatedOrg = await getOrg(org.id);
    expect(updatedOrg.activeSubscriptionId).toBeNull();
    const updatedSub = await getSubscription(localSub.id);
    expect(updatedSub.status).toBe('canceled');

    const auditRows = await db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.subscription_id, localSub.id));
    expect(auditRows.some((e) => e.event_type === 'canceled')).toBe(true);
  });

  it('records a status_changed event on customer.subscription.paused', async () => {
    const localSub = await insertSubscriptionRow(org.id, { stripeSubscriptionId: 'sub_stripe_1', status: 'active' });
    const stripeSub = makeStripeSubscription({ metadata: { subscription_id: localSub.id } });

    await handleSubscriptionEvent(makeEvent('customer.subscription.paused', stripeSub));

    const auditRows = await db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.subscription_id, localSub.id));
    expect(auditRows.some((e) => e.event_type === 'status_changed' && e.to_status === 'paused')).toBe(true);
  });

  it('logs and no-ops on an unhandled event type', async () => {
    await expect(
      handleSubscriptionEvent(makeEvent('customer.subscription.pending_update_applied', makeStripeSubscription()))
    ).resolves.toBeUndefined();
  });
});
