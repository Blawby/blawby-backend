// oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion
import { notificationsQueries } from '@/modules/notifications/database/queries/notifications.queries';
import type { SelectNotification } from '@/modules/notifications/database/schema/notifications.schema';
import { notificationsService } from '@/modules/notifications/services/notifications.service';
import { defineAbilityFor } from '@/shared/auth/abilities';
import type { User } from '@/shared/types/BetterAuth';
import { createServiceContext, type ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/notifications/database/queries/notifications.queries', () => ({
  notificationsQueries: {
    create: vi.fn(),
    listForRecipient: vi.fn(),
    findDashboardForRecipient: vi.fn(),
    markRead: vi.fn(),
    recordDeliveryOutcome: vi.fn(),
    findByIdAndOrg: vi.fn(),
  },
}));

const queries = vi.mocked(notificationsQueries);
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000003';
const NOTIFICATION_ID = '00000000-0000-4000-8000-000000000004';

const makeContext = (userId = USER_ID, organizationId = ORGANIZATION_ID): ServiceContext =>
  createServiceContext({
    userId,
    user: { id: userId, email: 'user@example.com', name: 'User' } as User,
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
  channel: 'dashboard',
  status: 'sent',
  event_type: 'matter.opened',
  template_name: null,
  title: 'Your matter was opened',
  body: null,
  payload: { matterId: 'matter_1' },
  deduplication_key: 'matter:1:opened',
  provider_message_id: null,
  failure_code: null,
  attempt_count: 0,
  last_attempt_at: null,
  delivered_at: new Date('2026-07-14T12:00:00.000Z'),
  read_at: null,
  created_at: new Date('2026-07-14T12:00:00.000Z'),
  updated_at: new Date('2026-07-14T12:00:00.000Z'),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('notificationsService.createNotification', () => {
  it('creates dashboard notifications as delivered and preserves deduplication results', async () => {
    queries.create.mockResolvedValue({ record: makeRecord(), created: false });

    const result = await notificationsService.createNotification({
      organizationId: ORGANIZATION_ID,
      recipientUserId: USER_ID,
      channel: 'dashboard',
      eventType: 'matter.opened',
      title: 'Your matter was opened',
      payload: { matterId: 'matter_1' },
      deduplicationKey: 'matter:1:opened',
    });

    expect(result.created).toBe(false);
    expect(queries.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', channel: 'dashboard', deduplication_key: 'matter:1:opened' })
    );
  });

  it('requires a template for email notification records', async () => {
    await expect(
      notificationsService.createNotification({
        organizationId: ORGANIZATION_ID,
        recipientUserId: USER_ID,
        channel: 'email',
        eventType: 'matter.opened',
        title: 'Matter opened',
        payload: {},
      })
    ).rejects.toThrow('Email notifications require a template name');
    expect(queries.create).not.toHaveBeenCalled();
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
    queries.findDashboardForRecipient.mockResolvedValue(makeRecord());
    queries.markRead.mockResolvedValue(updated);

    const result = await notificationsService.markRead(NOTIFICATION_ID, makeContext());

    expect(queries.findDashboardForRecipient).toHaveBeenCalledWith(NOTIFICATION_ID, {
      organizationId: ORGANIZATION_ID,
      recipientUserId: USER_ID,
    });
    expect(result.read_at).toBe('2026-07-14T12:05:00.000Z');
  });

  it('does not expose another recipient notification', async () => {
    queries.findDashboardForRecipient.mockResolvedValue(undefined);

    await expect(notificationsService.markRead(NOTIFICATION_ID, makeContext(OTHER_USER_ID))).rejects.toBeInstanceOf(
      HTTPException
    );
    expect(queries.markRead).not.toHaveBeenCalled();
  });

  it('is idempotent when the notification is already read', async () => {
    queries.findDashboardForRecipient.mockResolvedValue(makeRecord({ read_at: new Date('2026-07-14T12:05:00.000Z') }));

    await notificationsService.markRead(NOTIFICATION_ID, makeContext());

    expect(queries.markRead).not.toHaveBeenCalled();
  });
});

describe('notificationsService.recordDeliveryOutcome', () => {
  it('records a retry success after a previous failure', async () => {
    const sent = makeRecord({ channel: 'email', status: 'sent', provider_message_id: 'resend_1', attempt_count: 2 });
    queries.recordDeliveryOutcome.mockResolvedValue(sent);

    const result = await notificationsService.recordDeliveryOutcome(NOTIFICATION_ID, ORGANIZATION_ID, {
      status: 'sent',
      providerMessageId: 'resend_1',
    });

    expect(result.status).toBe('sent');
    expect(result.attempt_count).toBe(2);
  });

  it('rejects a conflicting change after a terminal delivery status', async () => {
    queries.recordDeliveryOutcome.mockResolvedValue(undefined);
    queries.findByIdAndOrg.mockResolvedValue(makeRecord({ channel: 'email', status: 'sent' }));

    await expect(
      notificationsService.recordDeliveryOutcome(NOTIFICATION_ID, ORGANIZATION_ID, {
        status: 'failed',
        failureCode: 'provider_rejected',
      })
    ).rejects.toMatchObject({ status: 409 });
  });
});
