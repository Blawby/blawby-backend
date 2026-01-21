/**
 * Matter Activity Service
 *
 * Handles logging and retrieval of matter activity
 */

import { eq, desc } from 'drizzle-orm';
import { db } from '@/shared/database';
import {
  matterActivityLog,
  type InsertMatterActivityLog,
  type SelectMatterActivityLog,
} from '../database/schema/matter-activity-log.schema';
import type { User } from '@/shared/types/BetterAuth';

/**
 * Log activity for a matter
 */
export const logMatterActivity = async (
  matterId: string,
  action: string,
  description: string,
  userId?: string,
  metadata?: Record<string, any>,
): Promise<SelectMatterActivityLog> => {
  const [activity] = await db
    .insert(matterActivityLog)
    .values({
      matterId,
      userId: userId || null,
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
): Promise<SelectMatterActivityLog[]> => {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  return await db
    .select()
    .from(matterActivityLog)
    .where(eq(matterActivityLog.matterId, matterId))
    .orderBy(desc(matterActivityLog.createdAt))
    .limit(limit)
    .offset(offset);
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
