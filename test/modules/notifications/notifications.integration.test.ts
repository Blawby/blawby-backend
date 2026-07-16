import { notificationDeliveries } from '@/modules/notifications/database/schema/notifications.schema';
import { notificationsQueries } from '@/modules/notifications/database/queries/notifications.queries';
import { notificationsService } from '@/modules/notifications/services/notifications.service';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

describe('notification persistence', () => {
  let organizationId = '';
  let recipientUserId = '';

  beforeAll(async () => {
    const context = await authHelpers.createTestContext('owner');
    organizationId = context.org.id;
    recipientUserId = context.session?.user.id ?? '';
    if (!recipientUserId) {
      throw new Error('Expected an authenticated notification test user');
    }
  });

  it('persists one logical notification with separate dashboard and email deliveries', async () => {
    const first = await notificationsService.createNotification({
      organizationId,
      recipientUserId,
      eventType: 'matter.opened',
      title: 'Your matter was opened',
      payload: { matterId: 'matter_1' },
      deduplicationKey: 'matter:1:opened',
      deliveries: [{ channel: 'dashboard' }, { channel: 'email', templateName: 'matter-opened' }],
    });

    expect(first.created).toBe(true);
    expect(first.createdDeliveries).toHaveLength(2);

    const persistedDeliveries = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notification_id, first.notification.id));

    expect(persistedDeliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'dashboard', status: 'sent' }),
        expect.objectContaining({ channel: 'email', status: 'pending', template_name: 'matter-opened' }),
      ])
    );

    const duplicate = await notificationsService.createNotification({
      organizationId,
      recipientUserId,
      eventType: 'matter.opened',
      title: 'Your matter was opened',
      payload: { matterId: 'matter_1' },
      deduplicationKey: 'matter:1:opened',
      deliveries: [{ channel: 'dashboard' }, { channel: 'email', templateName: 'matter-opened' }],
    });

    expect(duplicate.created).toBe(false);
    expect(duplicate.notification.id).toBe(first.notification.id);
    expect(duplicate.createdDeliveries).toEqual([]);
  });

  it('keeps email-only notifications out of the dashboard inbox', async () => {
    const emailOnly = await notificationsService.createNotification({
      organizationId,
      recipientUserId,
      eventType: 'matter.email-only',
      title: 'Email-only update',
      deliveries: [{ channel: 'email', templateName: 'matter-opened' }],
    });

    const inbox = await notificationsQueries.listForRecipient(
      { organizationId, recipientUserId },
      { unread_only: false, page: 1, limit: 100 }
    );

    expect(inbox.data.some((notification) => notification.id === emailOnly.notification.id)).toBe(false);
  });

  it('scopes dashboard read updates to both recipient and organization and remains idempotent', async () => {
    const otherContext = await authHelpers.createTestContext('owner');
    const otherOrganizationId = otherContext.org.id;
    const otherUserId = otherContext.session?.user.id ?? '';
    if (!otherUserId) {
      throw new Error('Expected a second authenticated notification test user');
    }

    const created = await notificationsService.createNotification({
      organizationId,
      recipientUserId,
      eventType: 'matter.read-scope',
      title: 'Scoped dashboard update',
      deliveries: [{ channel: 'dashboard' }],
    });

    const wrongRecipient = await notificationsQueries.markRead(created.notification.id, {
      organizationId,
      recipientUserId: otherUserId,
    });
    const wrongOrganization = await notificationsQueries.markRead(created.notification.id, {
      organizationId: otherOrganizationId,
      recipientUserId,
    });
    const firstRead = await notificationsQueries.markRead(created.notification.id, {
      organizationId,
      recipientUserId,
    });
    const secondRead = await notificationsQueries.markRead(created.notification.id, {
      organizationId,
      recipientUserId,
    });

    expect(wrongRecipient).toBeUndefined();
    expect(wrongOrganization).toBeUndefined();
    expect(firstRead?.read_at).toBeInstanceOf(Date);
    expect(secondRead).toBeUndefined();
  });

  it('does not update a delivery through another organization', async () => {
    const otherContext = await authHelpers.createTestContext('owner');
    const created = await notificationsService.createNotification({
      organizationId,
      recipientUserId,
      eventType: 'matter.delivery-scope',
      title: 'Scoped email delivery',
      deliveries: [{ channel: 'email', templateName: 'matter-opened' }],
    });
    const [delivery] = created.createdDeliveries;
    if (!delivery) {
      throw new Error('Expected a created notification delivery');
    }

    const crossOrganizationUpdate = await notificationsQueries.recordDeliveryOutcome(delivery.id, otherContext.org.id, {
      status: 'sent',
      providerMessageId: 'provider_cross_org',
    });
    const [persisted] = await getTestDb()
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, delivery.id));

    expect(crossOrganizationUpdate).toBeUndefined();
    expect(persisted?.status).toBe('pending');
    expect(persisted?.provider_message_id).toBeNull();
  });
});
