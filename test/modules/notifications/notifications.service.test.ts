import { notificationsQueries } from '@/modules/notifications/database/queries/notifications.queries';
import type {
  SelectNotification,
  SelectNotificationDelivery,
} from '@/modules/notifications/database/schema/notifications.schema';
import { notificationsService } from '@/modules/notifications/services/notifications.service';
import { defineAbilityFor } from '@/shared/auth/abilities';
import type { User } from '@/shared/types/BetterAuth';
import { createServiceContext, type ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/notifications/database/queries/notifications.queries', () => ({
  notificationsQueries: {
    createNotification: vi.fn(),
    createDeliveries: vi.fn(),
    listForRecipient: vi.fn(),
    findDashboardForRecipient: vi.fn(),
    markRead: vi.fn(),
    recordDeliveryOutcome: vi.fn(),
    findDeliveryByIdAndOrg: vi.fn(),
  },
}));

vi.mock('@/shared/database/uow', () => ({
  uow: {
    transaction: vi.fn((callback: () => Promise<unknown>) => callback()),
  },
}));

const queries = vi.mocked(notificationsQueries);
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000003';
const NOTIFICATION_ID = '00000000-0000-4000-8000-000000000004';
const DELIVERY_ID = '00000000-0000-4000-8000-000000000005';

const makeUser = (id: string): User => ({
  id,
  email: 'user@example.com',
  name: 'User',
  emailVerified: true,
  createdAt: new Date('2026-07-14T12:00:00.000Z'),
  updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  image: null,
});

const makeContext = (userId = USER_ID, organizationId = ORGANIZATION_ID): ServiceContext =>
  createServiceContext({
    userId,
    user: makeUser(userId),
    organizationId,
    memberRole: 'client',
    ability: defineAbilityFor('client', { userId, organizationId }),
    requestHeaders: {},
  });

const makeRecord = (overrides: Partial<SelectNotification> = {}): SelectNotification => ({
  id: NOTIFICATION_ID,
  organization_id: ORGANIZATION_ID,
  recipient_user_id: USER_ID,
  actor_user_id: null,
  event_type: 'matter.opened',
  title: 'Your matter was opened',
  body: null,
  payload: { matterId: 'matter_1' },
  deduplication_key: 'matter:1:opened',
  read_at: null,
  created_at: new Date('2026-07-14T12:00:00.000Z'),
  updated_at: new Date('2026-07-14T12:00:00.000Z'),
  ...overrides,
});

const makeDelivery = (overrides: Partial<SelectNotificationDelivery> = {}): SelectNotificationDelivery => ({
  id: DELIVERY_ID,
  notification_id: NOTIFICATION_ID,
  channel: 'email',
  status: 'pending',
  template_name: 'matter-opened',
  provider_message_id: null,
  failure_code: null,
  attempt_count: 0,
  last_attempt_at: null,
  delivered_at: null,
  created_at: new Date('2026-07-14T12:00:00.000Z'),
  updated_at: new Date('2026-07-14T12:00:00.000Z'),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('notificationsService.createNotification', () => {
  it('creates one logical notification with independent channel deliveries', async () => {
    queries.createNotification.mockResolvedValue({ record: makeRecord(), created: true });
    queries.createDeliveries.mockResolvedValue([]);

    const result = await notificationsService.createNotification({
      organizationId: ORGANIZATION_ID,
      recipientUserId: USER_ID,
      eventType: 'matter.opened',
      title: 'Your matter was opened',
      payload: { matterId: 'matter_1' },
      deduplicationKey: 'matter:1:opened',
      deliveries: [{ channel: 'dashboard' }, { channel: 'email', templateName: 'matter-opened' }],
    });

    expect(result.created).toBe(true);
    expect(result.createdDeliveries).toEqual([]);
    expect(queries.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ deduplication_key: 'matter:1:opened' })
    );
    expect(queries.createDeliveries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ notification_id: NOTIFICATION_ID, channel: 'dashboard', status: 'sent' }),
        expect.objectContaining({ notification_id: NOTIFICATION_ID, channel: 'email', status: 'pending' }),
      ])
    );
  });

  it('requires a template for email deliveries', async () => {
    await expect(
      notificationsService.createNotification({
        organizationId: ORGANIZATION_ID,
        recipientUserId: USER_ID,
        eventType: 'matter.opened',
        title: 'Matter opened',
        payload: {},
        deliveries: [{ channel: 'email' }],
      })
    ).rejects.toThrow('Email notifications require a template name');
    expect(queries.createNotification).not.toHaveBeenCalled();
  });
});

describe('notificationsService.listMyNotifications', () => {
  it('always scopes the list to the authenticated recipient and active organization', async () => {
    queries.listForRecipient.mockResolvedValue({ data: [makeRecord()], total: 1 });

    const result = await notificationsService.listMyNotifications(
      { unread_only: true, page: 2, limit: 10 },
      makeContext()
    );

    expect(queries.listForRecipient).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, recipientUserId: USER_ID },
      { unread_only: true, page: 2, limit: 10 }
    );
    expect(result.pagination).toEqual({ total: 1, page: 2, limit: 10 });
  });
});

describe('notificationsService.markRead', () => {
  it('marks only a notification found in the current user and organization scope', async () => {
    const updated = makeRecord({ read_at: new Date('2026-07-14T12:05:00.000Z') });
    queries.markRead.mockResolvedValue(updated);

    const result = await notificationsService.markRead(NOTIFICATION_ID, makeContext());

    expect(queries.markRead).toHaveBeenCalledWith(NOTIFICATION_ID, {
      organizationId: ORGANIZATION_ID,
      recipientUserId: USER_ID,
    });
    expect(queries.findDashboardForRecipient).not.toHaveBeenCalled();
    expect(result.read_at).toBe('2026-07-14T12:05:00.000Z');
  });

  it('does not expose another recipient notification', async () => {
    queries.markRead.mockResolvedValue(undefined);
    queries.findDashboardForRecipient.mockResolvedValue(undefined);

    await expect(notificationsService.markRead(NOTIFICATION_ID, makeContext(OTHER_USER_ID))).rejects.toBeInstanceOf(
      HTTPException
    );
    expect(queries.markRead).toHaveBeenCalledWith(NOTIFICATION_ID, {
      organizationId: ORGANIZATION_ID,
      recipientUserId: OTHER_USER_ID,
    });
    expect(queries.findDashboardForRecipient).toHaveBeenCalledWith(NOTIFICATION_ID, {
      organizationId: ORGANIZATION_ID,
      recipientUserId: OTHER_USER_ID,
    });
  });

  it('is idempotent when the notification is already read', async () => {
    queries.markRead.mockResolvedValue(undefined);
    queries.findDashboardForRecipient.mockResolvedValue(makeRecord({ read_at: new Date('2026-07-14T12:05:00.000Z') }));

    await notificationsService.markRead(NOTIFICATION_ID, makeContext());

    expect(queries.findDashboardForRecipient).toHaveBeenCalledWith(NOTIFICATION_ID, {
      organizationId: ORGANIZATION_ID,
      recipientUserId: USER_ID,
    });
  });
});

describe('notificationsService.recordDeliveryOutcome', () => {
  it('records a retry success after a previous failure', async () => {
    const sent = makeDelivery({ status: 'sent', provider_message_id: 'resend_1', attempt_count: 2 });
    queries.recordDeliveryOutcome.mockResolvedValue(sent);

    const result = await notificationsService.recordDeliveryOutcome(DELIVERY_ID, ORGANIZATION_ID, {
      status: 'sent',
      providerMessageId: 'resend_1',
    });

    expect(result.status).toBe('sent');
    expect(result.attempt_count).toBe(2);
  });

  it('rejects a conflicting change after a terminal delivery status', async () => {
    queries.recordDeliveryOutcome.mockResolvedValue(undefined);
    queries.findDeliveryByIdAndOrg.mockResolvedValue(makeDelivery({ status: 'sent' }));

    await expect(
      notificationsService.recordDeliveryOutcome(DELIVERY_ID, ORGANIZATION_ID, {
        status: 'failed',
        failureCode: 'provider_rejected',
      })
    ).rejects.toMatchObject({ status: 409 });
  });
});
