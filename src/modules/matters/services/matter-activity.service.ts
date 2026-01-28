/**
 * Matter Activity Service
 *
 * Handles logging and retrieval of matter activity
 */

import { getLogger } from '@logtape/logtape';
import { eq, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  matterActivityLog,
  type SelectMatterActivityLog,
} from '@/modules/matters/database/schema/matter-activity-log.schema';
import * as schema from '@/schema';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'activity']);

/**
 * Log activity for a matter
 */
export const logMatterActivity = async (
  matterId: string,
  action: string,
  description: string,
  userId?: string,
  metadata?: Record<string, unknown>,
  tx?: NodePgDatabase<typeof schema>,
): Promise<SelectMatterActivityLog> => {
  const client = tx ?? db;
  const [activity] = await client
    .insert(matterActivityLog)
    .values({
      matter_id: matterId,
      user_id: userId || null,
      action,
      description,
      metadata: metadata || null,
    })
    .returning();

  return activity;
};

/**
 * Get matter activity log
 */
export const getMatterActivity = async (
  matterId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
): Promise<Result<SelectMatterActivityLog[]>> => {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  try {
    const activity = await db
      .select()
      .from(matterActivityLog)
      .where(eq(matterActivityLog.matter_id, matterId))
      .orderBy(desc(matterActivityLog.created_at))
      .limit(limit)
      .offset(offset);

    return ok(activity);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get matter activity {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Activity action types
 */
export const ActivityAction = {
  MATTER_CREATED: 'matter_created',
  MATTER_UPDATED: 'matter_updated',
  MATTER_DELETED: 'matter_deleted',
  MATTER_STATUS_CHANGED: 'matter_status_changed',
  NOTE_ADDED: 'note_added',
  NOTE_UPDATED: 'note_updated',
  NOTE_DELETED: 'note_deleted',
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
