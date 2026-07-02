import {
  handlePriceCreated,
  handlePriceDeleted,
  handleProductCreated,
  handleProductUpdated,
} from '@/modules/subscriptions/handlers/index';
import { subscriptionWebhooksService } from '@/modules/subscriptions/services/subscription-webhooks.service';
import { isPriceEvent, isProductEvent } from '@/shared/utils/stripeGuards';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/subscriptions/handlers/index', () => ({
  handleProductCreated: vi.fn(),
  handleProductUpdated: vi.fn(),
  handleProductDeleted: vi.fn(),
  handlePriceCreated: vi.fn(),
  handlePriceUpdated: vi.fn(),
  handlePriceDeleted: vi.fn(),
}));

vi.mock('@/shared/utils/stripeGuards', () => ({
  isProductEvent: vi.fn(),
  isPriceEvent: vi.fn(),
}));

const isProductEventMock = vi.mocked(isProductEvent);
const isPriceEventMock = vi.mocked(isPriceEvent);
const handleProductCreatedMock = vi.mocked(handleProductCreated);
const handlePriceCreatedMock = vi.mocked(handlePriceCreated);

const makeEvent = (type: string, object: unknown = { id: 'obj_1' }): Stripe.Event =>
  ({ id: 'evt_test_1', type, data: { object } }) as unknown as Stripe.Event;

beforeEach(() => {
  vi.clearAllMocks();
  isProductEventMock.mockReturnValue(true);
  isPriceEventMock.mockReturnValue(true);
});

describe('subscriptionWebhooksService.processSubscriptionWebhookEvent', () => {
  it('dispatches product.created to the product-created handler', async () => {
    const event = makeEvent('product.created');

    await subscriptionWebhooksService.processSubscriptionWebhookEvent(event);

    expect(handleProductCreatedMock).toHaveBeenCalledWith(event.data.object);
  });

  it('dispatches price.created to the price-created handler', async () => {
    const event = makeEvent('price.created');

    await subscriptionWebhooksService.processSubscriptionWebhookEvent(event);

    expect(handlePriceCreatedMock).toHaveBeenCalledWith(event.data.object);
  });

  it('ignores unhandled event types without throwing', async () => {
    await expect(
      subscriptionWebhooksService.processSubscriptionWebhookEvent(makeEvent('payout.created'))
    ).resolves.toBeUndefined();
    expect(handleProductCreatedMock).not.toHaveBeenCalled();
  });

  it('throws when a product event payload fails the type guard', async () => {
    isProductEventMock.mockReturnValue(false);

    await expect(
      subscriptionWebhooksService.processSubscriptionWebhookEvent(makeEvent('product.updated'))
    ).rejects.toThrow('Unexpected payload for product event');
    expect(handleProductUpdated).not.toHaveBeenCalled();
  });

  it('throws when a price event payload fails the type guard', async () => {
    isPriceEventMock.mockReturnValue(false);

    await expect(
      subscriptionWebhooksService.processSubscriptionWebhookEvent(makeEvent('price.deleted'))
    ).rejects.toThrow('Unexpected payload for price event');
    expect(handlePriceDeleted).not.toHaveBeenCalled();
  });

  it('rethrows a non-Error thrown by the underlying handler wrapped as an Error', async () => {
    handleProductCreatedMock.mockImplementation(() => {
      throw 'raw string failure';
    });

    await expect(
      subscriptionWebhooksService.processSubscriptionWebhookEvent(makeEvent('product.created'))
    ).rejects.toThrow('Failed to process subscription webhook');
  });

  it('rethrows the original Error when the underlying handler throws one', async () => {
    handleProductCreatedMock.mockImplementation(() => {
      throw new Error('db down');
    });

    await expect(
      subscriptionWebhooksService.processSubscriptionWebhookEvent(makeEvent('product.created'))
    ).rejects.toThrow('db down');
  });
});

describe('subscriptionWebhooksService.isSubscriptionWebhookEvent', () => {
  it('recognizes product.* and price.* event types', () => {
    expect(subscriptionWebhooksService.isSubscriptionWebhookEvent('product.created')).toBe(true);
    expect(subscriptionWebhooksService.isSubscriptionWebhookEvent('price.updated')).toBe(true);
  });

  it('rejects other event types', () => {
    expect(subscriptionWebhooksService.isSubscriptionWebhookEvent('invoice.paid')).toBe(false);
  });
});
