import { intakeConversationMessagesQueries } from '@/modules/intake-conversations/database/queries/intake-conversation-messages.queries';
import { intakeConversationsQueries } from '@/modules/intake-conversations/database/queries/intake-conversations.queries';
import type { SelectIntakeConversationMessage } from '@/modules/intake-conversations/database/schema/intake-conversation-messages.schema';
import type {
  IntakeConversationMessageResponse,
  ListMessagesQuery,
} from '@/modules/intake-conversations/types/intake-conversations.types';
import type { CursorPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

const toResponse = (row: SelectIntakeConversationMessage): IntakeConversationMessageResponse => ({
  ...row,
  metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
  created_at: row.created_at.toISOString(),
});

const listMessages = async (
  conversationId: string,
  query: ListMessagesQuery,
  ctx: ServiceContext
): Promise<CursorPaginatedResponse<IntakeConversationMessageResponse>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'IntakeConversation');

  const conversation = await intakeConversationsQueries.findByIdAndOrg(conversationId, ctx.organizationId);
  if (!conversation) {
    throw new HTTPException(404, { message: 'Intake conversation not found' });
  }

  // Fetch one extra to detect next page without a count query
  const rows = await intakeConversationMessagesQueries.listByConversation(
    conversationId,
    query.from_seq,
    query.limit + 1
  );

  const hasNextPage = rows.length > query.limit;
  const items = hasNextPage ? rows.slice(0, query.limit) : rows;
  const hasPreviousPage = query.from_seq !== undefined && query.from_seq > 0;
  const lastItem = items[items.length - 1];

  return {
    data: items.map(toResponse),
    page_info: {
      has_next_page: hasNextPage,
      has_previous_page: hasPreviousPage,
      next_cursor: hasNextPage && lastItem ? String(lastItem.seq + 1) : null,
      previous_cursor: null,
    },
  };
};

export const intakeConversationMessagesService = {
  listMessages,
  toResponse,
};
