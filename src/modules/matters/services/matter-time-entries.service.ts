import { getLogger } from '@logtape/logtape';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import type { SelectMatterTimeEntry } from '@/modules/matters/database/schema/matter-time-entries.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterTimeEntryListFilters } from '@/modules/matters/types/matter-filters.types';
import type {
  CreateMatterTimeEntryRequest,
  UpdateMatterTimeEntryRequest,
} from '@/modules/matters/types/matter.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
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
  matterId: string,
  data: CreateMatterTimeEntryRequest,
  ctx: ServiceContext,
): Promise<Result<SelectMatterTimeEntry>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  const startTime = new Date(data.start_time);
  const endTime = new Date(data.end_time);
  const duration = calculateDuration(startTime, endTime);

  const entry = await matterTimeEntriesQueries.createMatterTimeEntry({
    matter_id: matterId,
    user_id: ctx.userId,
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
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    matterId,
    matterActivityService.ActivityAction.TIME_ENTRY_ADDED,
    `${userName} logged ${hours}h ${minutes}m${data.billable ? ' (billable)' : ''}`,
    ctx.userId,
    { duration, billable: data.billable, changed_fields: changedFields },
  );

  return ok(entry);
};

/**
 * List matter time entries
 */
const listMatterTimeEntries = async (
  matterId: string,
  filters: MatterTimeEntryListFilters | undefined,
  ctx: ServiceContext,
): Promise<Result<SelectMatterTimeEntry[]>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult as Result<never>;
  }

  try {
    // Short-circuit: direct lookup when a specific entry ID is provided.
    // When entryId is set, other filters (billable, startDate, endDate) are
    // intentionally ignored — this path is for single-resource retrieval.
    if (filters?.entryId) {
      const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(filters.entryId);
      if (!entry || entry.matter_id !== matterId) return ok([]);
      return ok([entry]);
    }

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
  matterId: string,
  entryId: string,
  data: UpdateMatterTimeEntryRequest,
  ctx: ServiceContext,
): Promise<Result<SelectMatterTimeEntry>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
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
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TIME_ENTRY_UPDATED,
      `${userName} updated a time entry`,
      ctx.userId,
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
  matterId: string,
  entryId: string,
  ctx: ServiceContext,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
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
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TIME_ENTRY_DELETED,
      `${userName} deleted a time entry`,
      ctx.userId,
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
  matterId: string,
  ctx: ServiceContext,
): Promise<Result<{
  totalBillableSeconds: number;
  totalSeconds: number;
  totalBillableHours: number;
  totalHours: number;
}>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
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
