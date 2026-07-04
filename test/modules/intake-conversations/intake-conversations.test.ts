import { intakeConversationsQueries } from '@/modules/intake-conversations/database/queries/intake-conversations.queries';
import type { SelectIntakeConversation } from '@/modules/intake-conversations/database/schema/intake-conversations.schema';
import { intakeConversationsService } from '@/modules/intake-conversations/services/intake-conversations.service';
import { defineAbilityFor } from '@/shared/auth/abilities';
import type { User } from '@/shared/types/BetterAuth';
import { createServiceContext } from '@/shared/types/service-context';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/intake-conversations/database/queries/intake-conversations.queries', () => ({
  intakeConversationsQueries: {
    list: vi.fn(),
    findByIdAndOrg: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

const listMock = vi.mocked(intakeConversationsQueries.list);
const findByIdMock = vi.mocked(intakeConversationsQueries.findByIdAndOrg);
const updateMock = vi.mocked(intakeConversationsQueries.update);
const softDeleteMock = vi.mocked(intakeConversationsQueries.softDelete);

const ORG_ID = 'org_test_1';
const CONVERSATION_ID = 'conv_test_1';

const makeCtx = (role: string | null): ServiceContext =>
  createServiceContext({
    userId: 'user_test_1',
    user: { id: 'user_test_1', email: 'test@example.com', name: 'Test User' } as User,
    organizationId: ORG_ID,
    memberRole: role,
    ability: defineAbilityFor(role),
    requestHeaders: {},
  });

const makeRow = (overrides: Partial<SelectIntakeConversation> = {}): SelectIntakeConversation =>
  ({
    id: CONVERSATION_ID,
    organization_id: ORG_ID,
    client_user_id: 'user_test_1',
    is_anonymous: false,
    matter_id: null,
    status: 'active',
    lifecycle_status: 'visible',
    assigned_to_user_id: null,
    priority: 'normal',
    tags: null,
    internal_notes: null,
    last_message_at: null,
    last_message_content: null,
    latest_seq: 0,
    intake_mode_activated_at: null,
    ai_failed_at: null,
    first_response_at: null,
    closed_at: null,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  }) as SelectIntakeConversation;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('intakeConversationsService.listIntakeConversations', () => {
  it('allows admins to list conversations', async () => {
    listMock.mockResolvedValue({ data: [makeRow()], total: 1 });

    const result = await intakeConversationsService.listIntakeConversations(
      { practice_id: ORG_ID, page: 1, limit: 20 },
      makeCtx('owner')
    );

    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({ total: 1, page: 1, limit: 20 });
    expect(listMock).toHaveBeenCalledWith({ practice_id: ORG_ID, page: 1, limit: 20 });
  });

  it('allows members to list conversations', async () => {
    listMock.mockResolvedValue({ data: [], total: 0 });

    await intakeConversationsService.listIntakeConversations(
      { practice_id: ORG_ID, page: 1, limit: 20 },
      makeCtx('member')
    );

    expect(listMock).toHaveBeenCalledOnce();
  });

  it('forbids clients from listing conversations', async () => {
    await expect(
      intakeConversationsService.listIntakeConversations({ practice_id: ORG_ID, page: 1, limit: 20 }, makeCtx('client'))
    ).rejects.toThrow();
    expect(listMock).not.toHaveBeenCalled();
  });

  it('serializes nullable timestamp fields to ISO strings or null', async () => {
    listMock.mockResolvedValue({
      data: [makeRow({ last_message_at: new Date('2026-05-02T10:00:00.000Z'), closed_at: null })],
      total: 1,
    });

    const result = await intakeConversationsService.listIntakeConversations(
      { practice_id: ORG_ID, page: 1, limit: 20 },
      makeCtx('owner')
    );

    expect(result.data[0]?.last_message_at).toBe('2026-05-02T10:00:00.000Z');
    expect(result.data[0]?.closed_at).toBeNull();
  });
});

describe('intakeConversationsService.getIntakeConversation', () => {
  it('returns the conversation when it exists in the org', async () => {
    findByIdMock.mockResolvedValue(makeRow());

    const result = await intakeConversationsService.getIntakeConversation(CONVERSATION_ID, makeCtx('owner'));

    expect(result.id).toBe(CONVERSATION_ID);
    expect(findByIdMock).toHaveBeenCalledWith(CONVERSATION_ID, ORG_ID);
  });

  it('throws 404 when the conversation does not exist', async () => {
    findByIdMock.mockResolvedValue(undefined);

    await expect(intakeConversationsService.getIntakeConversation(CONVERSATION_ID, makeCtx('owner'))).rejects.toThrow(
      HTTPException
    );
  });

  it('forbids clients from reading a conversation', async () => {
    await expect(
      intakeConversationsService.getIntakeConversation(CONVERSATION_ID, makeCtx('client'))
    ).rejects.toThrow();
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});

describe('intakeConversationsService.updateIntakeConversation', () => {
  it('allows members to update a conversation', async () => {
    findByIdMock.mockResolvedValue(makeRow());
    updateMock.mockResolvedValue(makeRow({ priority: 'urgent' }));

    const result = await intakeConversationsService.updateIntakeConversation(
      CONVERSATION_ID,
      { priority: 'urgent' },
      makeCtx('member')
    );

    expect(result.priority).toBe('urgent');
  });

  it('forbids clients from updating a conversation', async () => {
    await expect(
      intakeConversationsService.updateIntakeConversation(CONVERSATION_ID, { priority: 'urgent' }, makeCtx('client'))
    ).rejects.toThrow();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('throws 404 when updating a conversation that does not exist', async () => {
    findByIdMock.mockResolvedValue(undefined);

    await expect(
      intakeConversationsService.updateIntakeConversation(CONVERSATION_ID, { priority: 'urgent' }, makeCtx('owner'))
    ).rejects.toThrow(HTTPException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('throws 500 when the update unexpectedly returns nothing', async () => {
    findByIdMock.mockResolvedValue(makeRow());
    updateMock.mockResolvedValue(undefined);

    await expect(
      intakeConversationsService.updateIntakeConversation(CONVERSATION_ID, { priority: 'urgent' }, makeCtx('owner'))
    ).rejects.toThrow(HTTPException);
  });
});

describe('intakeConversationsService.deleteIntakeConversation', () => {
  it('forbids members from deleting a conversation', async () => {
    await expect(
      intakeConversationsService.deleteIntakeConversation(CONVERSATION_ID, makeCtx('member'))
    ).rejects.toThrow();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('allows admins to delete a conversation', async () => {
    findByIdMock.mockResolvedValue(makeRow());

    await intakeConversationsService.deleteIntakeConversation(CONVERSATION_ID, makeCtx('owner'));

    expect(softDeleteMock).toHaveBeenCalledWith(CONVERSATION_ID, ORG_ID);
  });

  it('throws 404 when deleting a conversation that does not exist', async () => {
    findByIdMock.mockResolvedValue(undefined);

    await expect(
      intakeConversationsService.deleteIntakeConversation(CONVERSATION_ID, makeCtx('owner'))
    ).rejects.toThrow(HTTPException);
    expect(softDeleteMock).not.toHaveBeenCalled();
  });
});
