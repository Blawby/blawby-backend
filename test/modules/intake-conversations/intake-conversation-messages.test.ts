import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { intakeConversationMessagesQueries } from '@/modules/intake-conversations/database/queries/intake-conversation-messages.queries';
import { intakeConversationsQueries } from '@/modules/intake-conversations/database/queries/intake-conversations.queries';
import type { SelectIntakeConversation } from '@/modules/intake-conversations/database/schema/intake-conversations.schema';
import type { SelectIntakeConversationMessage } from '@/modules/intake-conversations/database/schema/intake-conversation-messages.schema';
import { intakeConversationMessagesService } from '@/modules/intake-conversations/services/intake-conversation-messages.service';
import { defineAbilityFor } from '@/shared/auth/abilities';
import type { ServiceContext } from '@/shared/types/service-context';

vi.mock('@/modules/intake-conversations/database/queries/intake-conversation-messages.queries', () => ({
  intakeConversationMessagesQueries: {
    listByConversation: vi.fn(),
  },
}));

vi.mock('@/modules/intake-conversations/database/queries/intake-conversations.queries', () => ({
  intakeConversationsQueries: {
    findByIdAndOrg: vi.fn(),
  },
}));

const listByConversationMock = vi.mocked(intakeConversationMessagesQueries.listByConversation);
const findByIdMock = vi.mocked(intakeConversationsQueries.findByIdAndOrg);

const ORG_ID = 'org_test_1';
const CONVERSATION_ID = 'conv_test_1';

const makeCtx = (role: string | null): ServiceContext =>
  ({ organizationId: ORG_ID, ability: defineAbilityFor(role) }) as unknown as ServiceContext;

const makeConversation = (): SelectIntakeConversation =>
  ({ id: CONVERSATION_ID, organization_id: ORG_ID }) as SelectIntakeConversation;

const makeMessage = (overrides: Partial<SelectIntakeConversationMessage> = {}): SelectIntakeConversationMessage =>
  ({
    id: 'msg_test_1',
    conversation_id: CONVERSATION_ID,
    organization_id: ORG_ID,
    user_id: null,
    role: 'user',
    content: 'hello',
    reply_to_message_id: null,
    metadata: null,
    seq: 1,
    client_id: 'client_1',
    token_count: null,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  }) as SelectIntakeConversationMessage;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('intakeConversationMessagesService.listMessages', () => {
  it('forbids clients from listing messages', async () => {
    await expect(
      intakeConversationMessagesService.listMessages(CONVERSATION_ID, { limit: 20 }, makeCtx('client'))
    ).rejects.toThrow();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('throws 404 when the conversation does not exist in the org', async () => {
    findByIdMock.mockResolvedValue(undefined);

    await expect(
      intakeConversationMessagesService.listMessages(CONVERSATION_ID, { limit: 20 }, makeCtx('owner'))
    ).rejects.toThrow(HTTPException);
    expect(listByConversationMock).not.toHaveBeenCalled();
  });

  it('fetches one extra row to detect the next page and trims it off', async () => {
    findByIdMock.mockResolvedValue(makeConversation());
    listByConversationMock.mockResolvedValue([
      makeMessage({ seq: 1 }),
      makeMessage({ seq: 2 }),
      makeMessage({ seq: 3 }),
    ]);

    const result = await intakeConversationMessagesService.listMessages(
      CONVERSATION_ID,
      { limit: 2 },
      makeCtx('owner')
    );

    expect(listByConversationMock).toHaveBeenCalledWith(CONVERSATION_ID, undefined, 3);
    expect(result.data).toHaveLength(2);
    expect(result.page_info).toEqual({
      has_next_page: true,
      has_previous_page: false,
      next_cursor: '3',
      previous_cursor: null,
    });
  });

  it('reports no next page when fewer rows than the limit are returned', async () => {
    findByIdMock.mockResolvedValue(makeConversation());
    listByConversationMock.mockResolvedValue([makeMessage({ seq: 1 })]);

    const result = await intakeConversationMessagesService.listMessages(
      CONVERSATION_ID,
      { limit: 20 },
      makeCtx('owner')
    );

    expect(result.page_info.has_next_page).toBe(false);
    expect(result.page_info.next_cursor).toBeNull();
  });

  it('reports has_previous_page when from_seq is set and greater than zero', async () => {
    findByIdMock.mockResolvedValue(makeConversation());
    listByConversationMock.mockResolvedValue([makeMessage({ seq: 5 })]);

    const result = await intakeConversationMessagesService.listMessages(
      CONVERSATION_ID,
      { limit: 20, from_seq: 4 },
      makeCtx('owner')
    );

    expect(result.page_info.has_previous_page).toBe(true);
  });

  it('does not report has_previous_page when from_seq is zero', async () => {
    findByIdMock.mockResolvedValue(makeConversation());
    listByConversationMock.mockResolvedValue([makeMessage({ seq: 1 })]);

    const result = await intakeConversationMessagesService.listMessages(
      CONVERSATION_ID,
      { limit: 20, from_seq: 0 },
      makeCtx('owner')
    );

    expect(result.page_info.has_previous_page).toBe(false);
  });
});
