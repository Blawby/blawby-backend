import { intakeConversationsQueries } from '@/modules/intake-conversations/database/queries/intake-conversations.queries';
import type { SelectIntakeConversation } from '@/modules/intake-conversations/database/schema/intake-conversations.schema';
import type {
  IntakeConversationResponse,
  ListIntakeConversationsQuery,
  UpdateIntakeConversationRequest,
} from '@/modules/intake-conversations/types/intake-conversations.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

const toResponse = (row: SelectIntakeConversation): IntakeConversationResponse => ({
  ...row,
  tags: row.tags ?? null,
  last_message_at: row.last_message_at?.toISOString() ?? null,
  intake_mode_activated_at: row.intake_mode_activated_at?.toISOString() ?? null,
  ai_failed_at: row.ai_failed_at?.toISOString() ?? null,
  first_response_at: row.first_response_at?.toISOString() ?? null,
  closed_at: row.closed_at?.toISOString() ?? null,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
});

const listIntakeConversations = async (
  query: ListIntakeConversationsQuery,
  ctx: ServiceContext
): Promise<{ data: IntakeConversationResponse[]; pagination: { total: number; page: number; limit: number } }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'IntakeConversation');

  const { data, total } = await intakeConversationsQueries.list({ ...query, practice_id: ctx.organizationId });
  return {
    data: data.map(toResponse),
    pagination: { total, page: query.page, limit: query.limit },
  };
};

const getIntakeConversation = async (id: string, ctx: ServiceContext): Promise<IntakeConversationResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'IntakeConversation');

  const row = await intakeConversationsQueries.findByIdAndOrg(id, ctx.organizationId);
  if (!row) {
    throw new HTTPException(404, { message: 'Intake conversation not found' });
  }
  return toResponse(row);
};

const updateIntakeConversation = async (
  id: string,
  data: UpdateIntakeConversationRequest,
  ctx: ServiceContext
): Promise<IntakeConversationResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'IntakeConversation');

  const existing = await intakeConversationsQueries.findByIdAndOrg(id, ctx.organizationId);
  if (!existing) {
    throw new HTTPException(404, { message: 'Intake conversation not found' });
  }

  const updated = await intakeConversationsQueries.update(id, data, ctx.organizationId);
  if (!updated) {
    throw new HTTPException(500, { message: 'Failed to update intake conversation' });
  }
  return toResponse(updated);
};

const deleteIntakeConversation = async (id: string, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'IntakeConversation');

  const existing = await intakeConversationsQueries.findByIdAndOrg(id, ctx.organizationId);
  if (!existing) {
    throw new HTTPException(404, { message: 'Intake conversation not found' });
  }

  await intakeConversationsQueries.softDelete(id, ctx.organizationId);
};

export const intakeConversationsService = {
  listIntakeConversations,
  getIntakeConversation,
  updateIntakeConversation,
  deleteIntakeConversation,
  toResponse,
};
