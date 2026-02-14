import { getLogger } from '@logtape/logtape';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import type { SelectMatterTimeEntry } from '@/modules/matters/database/schema/matter-time-entries.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
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
const createMatterTimeEntry = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterTimeEntryRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterTimeEntry>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    const startTime = new Date(data.start_time);
    const endTime = new Date(data.end_time);
    const duration = calculateDuration(startTime, endTime);

    const entry = await matterTimeEntriesQueries.createMatterTimeEntry({
      matter_id: matterId,
      user_id: user.id,
      start_time: startTime,
      end_time: endTime,
      duration,
      description: data.description,
      billable: data.billable,
    });
    const changedFields = [
      'start_time',
      'end_time',
      'duration',
      ...(data.billable !== undefined ? ['billable'] : []),
      ...(data.description !== undefined ? ['description'] : []),
    ];

    // Log activity
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TIME_ENTRY_ADDED,
      `${user.name || user.email} logged ${hours}h ${minutes}m${data.billable ? ' (billable)' : ''}`,
      user.id,
      { duration, billable: data.billable, changed_fields: changedFields },
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
const listMatterTimeEntries = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
  filters?: {
    billable?: boolean;
    startDate?: Date;
    endDate?: Date;
    entry_uuid?: string;
  },
): Promise<Result<SelectMatterTimeEntry[]>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    const entries = await matterTimeEntriesQueries.listMatterTimeEntries(matterId, filters);
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
const updateMatterTimeEntry = async (
  organizationId: string,
  matterId: string,
  entryId: string,
  data: UpdateMatterTimeEntryRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterTimeEntry>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Verify entry exists and belongs to matter
    const entry: SelectMatterTimeEntry | undefined = await matterTimeEntriesQueries.findMatterTimeEntryById(entryId);
    if (!entry || entry.matter_id !== matterId) {
      return notFound('Time entry not found');
    }

    // Recalculate duration if times changed
    const startTime = data.start_time ? new Date(data.start_time) : entry.start_time;
    const endTime = data.end_time ? new Date(data.end_time) : entry.end_time;

    const updateData: Parameters<typeof matterTimeEntriesQueries.updateMatterTimeEntry>[1] = {
      ...(data.start_time && { start_time: startTime }),
      ...(data.end_time && { end_time: endTime }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.billable !== undefined && { billable: data.billable }),
      ...((data.start_time || data.end_time) && { duration: calculateDuration(startTime, endTime) }),
    };

    const updated = await matterTimeEntriesQueries.updateMatterTimeEntry(entryId, updateData);
    const changedFields = [];
    if (data.start_time && entry.start_time.toISOString() !== startTime.toISOString()) {
      changedFields.push('start_time');
    }
    if (data.end_time && entry.end_time.toISOString() !== endTime.toISOString()) {
      changedFields.push('end_time');
    }
    if (data.description !== undefined && data.description !== entry.description) {
      changedFields.push('description');
    }
    if (data.billable !== undefined && data.billable !== entry.billable) {
      changedFields.push('billable');
    }
    if ((data.start_time || data.end_time) && entry.duration !== updateData.duration) {
      changedFields.push('duration');
    }

    // Log activity
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TIME_ENTRY_UPDATED,
      `${user.name || user.email} updated a time entry`,
      user.id,
      { changed_fields: changedFields },
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
const deleteMatterTimeEntry = async (
  organizationId: string,
  matterId: string,
  entryId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Verify entry exists and belongs to matter
    const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(entryId);
    if (!entry || entry.matter_id !== matterId) {
      return notFound('Time entry not found');
    }

    await matterTimeEntriesQueries.deleteMatterTimeEntry(entryId);

    // Log activity
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TIME_ENTRY_DELETED,
      `${user.name || user.email} deleted a time entry`,
      user.id,
      { changed_fields: ['deleted'] },
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
const getTimeEntryStats = async (
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
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    const totalBillable = await matterTimeEntriesQueries.getTotalBillableTime(matterId);
    const totalTime = await matterTimeEntriesQueries.getTotalTime(matterId);

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

export const matterTimeEntriesService = {
  createMatterTimeEntry,
  listMatterTimeEntries,
  updateMatterTimeEntry,
  deleteMatterTimeEntry,
  getTimeEntryStats,
};
