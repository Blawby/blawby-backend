import { intakeConversationMessagesQueries } from '@/modules/intake-conversations/database/queries/intake-conversation-messages.queries';
import { intakeConversationsQueries } from '@/modules/intake-conversations/database/queries/intake-conversations.queries';
import type { SelectIntakeConversationMessage } from '@/modules/intake-conversations/database/schema/intake-conversation-messages.schema';
import type {
  IntakeConversationMessageResponse,
  ListMessagesQuery,
} from '@/modules/intake-conversations/types/intake-conversations.types';
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
): Promise<IntakeConversationMessageResponse[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'IntakeConversation');

  const conversation = await intakeConversationsQueries.findByIdAndOrg(conversationId, ctx.organizationId);
  if (!conversation) {
    throw new HTTPException(404, { message: 'Intake conversation not found' });
  }

  const messages = await intakeConversationMessagesQueries.listByConversation(
    conversationId,
    query.from_seq,
    query.limit
  );
  return messages.map(toResponse);
};

export const intakeConversationMessagesService = {
  listMessages,
  toResponse,
};
