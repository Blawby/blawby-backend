import {
  intakeConversationMessages,
  type InsertIntakeConversationMessage,
  type SelectIntakeConversationMessage,
} from '@/modules/intake-conversations/database/schema/intake-conversation-messages.schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, asc, eq, gte } from 'drizzle-orm';

const listByConversation = async (
  conversationId: string,
  fromSeq?: number,
  limit = 50
): Promise<SelectIntakeConversationMessage[]> => {
  const conditions = [eq(intakeConversationMessages.conversation_id, conversationId)];
  if (fromSeq !== undefined) {
    conditions.push(gte(intakeConversationMessages.seq, fromSeq));
  }
  return getActiveTx()
    .select()
    .from(intakeConversationMessages)
    .where(and(...conditions))
    .orderBy(asc(intakeConversationMessages.seq))
    .limit(limit);
};

const upsert = async (data: InsertIntakeConversationMessage): Promise<SelectIntakeConversationMessage> => {
  const [row] = await getActiveTx()
    .insert(intakeConversationMessages)
    .values(data)
    .onConflictDoNothing({ target: [intakeConversationMessages.conversation_id, intakeConversationMessages.client_id] })
    .returning();
  if (!row) {
    const [existing] = await getActiveTx()
      .select()
      .from(intakeConversationMessages)
      .where(
        and(
          eq(intakeConversationMessages.conversation_id, data.conversation_id),
          eq(intakeConversationMessages.client_id, data.client_id)
        )
      )
      .limit(1);
    if (!existing)
      throw new Error(
        `IntakeConversationMessage not found after conflict for conversation ${data.conversation_id} client_id ${data.client_id}`
      );
    return existing;
  }
  return row;
};

export const intakeConversationMessagesQueries = {
  listByConversation,
  upsert,
};
