/**
 * Matter Activity Service
 *
 * Handles logging and retrieval of matter activity
 */

import { getLogger } from '@logtape/logtape';
import { eq, desc, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  matterActivityLog,
  type SelectMatterActivityLog,
} from '@/modules/matters/database/schema/matter-activity-log.schema';
import type { MatterActivityListFilters } from '@/modules/matters/types/matter-filters.types';
import type * as schema from '@/schema';
import { db } from '@/shared/database';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['matters', 'services', 'activity']);

/**
 * Log activity for a matter
 */
const logMatterActivity = async (
  params: {
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
    matterId?: string;
  },
  ctx: ServiceContext,
  tx?: NodePgDatabase<typeof schema>
): Promise<void> => {
  const matterId = params.matterId ?? ctx.matterId;

  if (!matterId) {
    logger.error('Failed to log activity: matterId is missing', {
      action: params.action,
      userId: ctx.userId,
    });
    return;
  }

  try {
    const client = tx ?? db;
    await client.insert(matterActivityLog).values({
      matter_id: matterId,
      user_id: ctx.userId || null,
      action: params.action,
      description: params.description,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    logger.error('Failed to insert activity log for matter {matterId}: {error}', {
      matterId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get matter activity log
 */
const getMatterActivity = async (
  options: MatterActivityListFilters | undefined,
  ctx: ServiceContext
): Promise<SelectMatterActivityLog[]> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  const { mattersService } = await import('@/modules/matters/services/matters.service');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  if (options?.activityId) {
    const [activity] = await db
      .select()
      .from(matterActivityLog)
      .where(and(eq(matterActivityLog.matter_id, matterId), eq(matterActivityLog.id, options.activityId)))
      .limit(1);
    return activity ? [activity] : [];
  }

  return db
    .select()
    .from(matterActivityLog)
    .where(eq(matterActivityLog.matter_id, matterId))
    .orderBy(desc(matterActivityLog.created_at))
    .limit(limit)
    .offset(offset);
};

/**
 * Activity action types
 */
const ActivityAction = {
  MATTER_CREATED: 'matter_created',
  MATTER_UPDATED: 'matter_updated',
  MATTER_DELETED: 'matter_deleted',
  MATTER_STATUS_CHANGED: 'matter_status_changed',
  NOTE_ADDED: 'note_added',
  NOTE_UPDATED: 'note_updated',
  NOTE_DELETED: 'note_deleted',
  TASK_CREATED: 'task_created',
  TASK_UPDATED: 'task_updated',
  TASK_DELETED: 'task_deleted',
  TASK_COMPLETED: 'task_completed',
  TASKS_GENERATED: 'tasks_generated',
  TIME_ENTRY_ADDED: 'time_entry_added',
  TIME_ENTRY_UPDATED: 'time_entry_updated',
  TIME_ENTRY_DELETED: 'time_entry_deleted',
  EXPENSE_ADDED: 'expense_added',
  EXPENSE_UPDATED: 'expense_updated',
  EXPENSE_DELETED: 'expense_deleted',
  MILESTONE_CREATED: 'milestone_created',
  MILESTONE_UPDATED: 'milestone_updated',
  MILESTONE_DELETED: 'milestone_deleted',
  MILESTONE_COMPLETED: 'milestone_completed',
  ASSIGNEE_ADDED: 'assignee_added',
  ASSIGNEE_REMOVED: 'assignee_removed',
} as const;

export const matterActivityService = {
  logMatterActivity,
  getMatterActivity,
  ActivityAction,
};
