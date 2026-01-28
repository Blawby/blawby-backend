import { getLogger } from '@logtape/logtape';
import * as timeEntriesQueries from '@/modules/matters/database/queries/matter-time-entries.queries';
import type { SelectMatterTimeEntry } from '@/modules/matters/database/schema/matter-time-entries.schema';
import { logMatterActivity, ActivityAction } from '@/modules/matters/services/matter-activity.service';
import { getMatterById } from '@/modules/matters/services/matters.service';
import type {
  CreateMatterTimeEntryRequest,
  UpdateMatterTimeEntryRequest,
} from '@/modules/matters/types/matter.types';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'time-entries']);

/**
 * Calculate duration in seconds between two dates
 */
const calculateDuration = (startTime: Date, endTime: Date): number => {
  return Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
};

/**
 * Create a matter time entry
 */
export const createMatterTimeEntry = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterTimeEntryRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterTimeEntry>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    const startTime = new Date(data.start_time);
    const endTime = new Date(data.end_time);
    const duration = calculateDuration(startTime, endTime);

    const entry = await timeEntriesQueries.createMatterTimeEntry({
      matter_id: matterId,
      user_id: user.id,
      start_time: startTime,
      end_time: endTime,
      duration,
      description: data.description,
      billable: data.billable,
    });

    // Log activity
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    await logMatterActivity(
      matterId,
      ActivityAction.TIME_ENTRY_ADDED,
      `${user.name || user.email} logged ${hours}h ${minutes}m${data.billable ? ' (billable)' : ''}`,
      user.id,
      { duration, billable: data.billable },
    );

    return ok(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create time entry {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * List matter time entries
 */
export const listMatterTimeEntries = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
  filters?: {
    billable?: boolean;
    startDate?: Date;
    endDate?: Date;
  },
): Promise<Result<SelectMatterTimeEntry[]>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    const entries = await timeEntriesQueries.listMatterTimeEntries(matterId, filters);
    return ok(entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list time entries {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Update matter time entry
 */
export const updateMatterTimeEntry = async (
  organizationId: string,
  matterId: string,
  entryId: string,
  data: UpdateMatterTimeEntryRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterTimeEntry>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Verify entry exists and belongs to matter
    const entry: SelectMatterTimeEntry | undefined = await timeEntriesQueries.findMatterTimeEntryById(entryId);
    if (!entry || entry.matter_id !== matterId) {
      return notFound('Time entry not found');
    }

    // Recalculate duration if times changed
    const startTime = data.start_time ? new Date(data.start_time) : entry.start_time;
    const endTime = data.end_time ? new Date(data.end_time) : entry.end_time;

    const updateData: Parameters<typeof timeEntriesQueries.updateMatterTimeEntry>[1] = {
      ...(data.start_time && { start_time: startTime }),
      ...(data.end_time && { end_time: endTime }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.billable !== undefined && { billable: data.billable }),
      ...((data.start_time || data.end_time) && { duration: calculateDuration(startTime, endTime) }),
    };

    const updated = await timeEntriesQueries.updateMatterTimeEntry(entryId, updateData);

    // Log activity
    await logMatterActivity(
      matterId,
      ActivityAction.TIME_ENTRY_UPDATED,
      `${user.name || user.email} updated a time entry`,
      user.id,
    );

    return ok(updated!);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update time entry {entryId}: {error}', {
      entryId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter time entry
 */
export const deleteMatterTimeEntry = async (
  organizationId: string,
  matterId: string,
  entryId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Verify entry exists and belongs to matter
    const entry = await timeEntriesQueries.findMatterTimeEntryById(entryId);
    if (!entry || entry.matter_id !== matterId) {
      return notFound('Time entry not found');
    }

    await timeEntriesQueries.deleteMatterTimeEntry(entryId);

    // Log activity
    await logMatterActivity(
      matterId,
      ActivityAction.TIME_ENTRY_DELETED,
      `${user.name || user.email} deleted a time entry`,
      user.id,
    );

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete time entry {entryId}: {error}', {
      entryId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Get time entry statistics
 */
export const getTimeEntryStats = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{
  totalBillableSeconds: number;
  totalSeconds: number;
  totalBillableHours: number;
  totalHours: number;
}>> => {
  // Verify user has access to matter
  const matterResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    const totalBillable = await timeEntriesQueries.getTotalBillableTime(matterId);
    const totalTime = await timeEntriesQueries.getTotalTime(matterId);

    return ok({
      totalBillableSeconds: totalBillable,
      totalSeconds: totalTime,
      totalBillableHours: totalBillable / 3600,
      totalHours: totalTime / 3600,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get time entry stats {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

