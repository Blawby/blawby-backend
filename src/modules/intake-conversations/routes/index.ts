import {
  deleteIntakeConversationRoute,
  getIntakeConversationRoute,
  listIntakeConversationsRoute,
  updateIntakeConversationRoute,
} from '@/modules/intake-conversations/routes/core.routes';
import { listIntakeConversationMessagesRoute } from '@/modules/intake-conversations/routes/messages.routes';

export const routes = {
  listIntakeConversationsRoute,
  getIntakeConversationRoute,
  updateIntakeConversationRoute,
  deleteIntakeConversationRoute,
  listIntakeConversationMessagesRoute,
};
