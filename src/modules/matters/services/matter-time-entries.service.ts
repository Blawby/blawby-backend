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
import { badRequest, ok, forbidden, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'time-entries']);

/**
 * Calculate duration in seconds between two dates
 */
const calculateDuration = (startTime: Date, endTime: Date): number => {
  return Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
};

const getValidatedDuration = (
  startTime: Date,
  endTime: Date,
): Result<{ duration: number }> => {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return badRequest('start_time and end_time must be valid dates');
  }
  if (endTime <= startTime) {
    return badRequest('end_time must be after start_time');
  }
  return ok({ duration: calculateDuration(startTime, endTime) });
};

/**
 * Create a matter time entry
 */
const createMatterTimeEntry = async (
  params: { data: CreateMatterTimeEntryRequest },
  ctx: ServiceContext,
): Promise<Result<SelectMatterTimeEntry>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const startTime = new Date(params.data.start_time);
    const endTime = new Date(params.data.end_time);
    const durationResult = getValidatedDuration(startTime, endTime);
    if (!durationResult.success) {
      return durationResult;
    }
    const { duration } = durationResult.data;

    const entry = await matterTimeEntriesQueries.createMatterTimeEntry({
      matter_id: matterId,
      user_id: ctx.userId,
      start_time: startTime,
      end_time: endTime,
      duration,
      description: params.data.description,
      billable: params.data.billable,
    });
    const changedFields = [
      'start_time',
      'end_time',
      'duration',
      ...(params.data.billable !== undefined ? ['billable'] : []),
      ...(params.data.description !== undefined ? ['description'] : []),
    ];

    // Log activity
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.TIME_ENTRY_ADDED,
        description: `${userName} logged ${hours}h ${minutes}m${params.data.billable ? ' (billable)' : ''}`,
        metadata: { duration, billable: params.data.billable, changed_fields: changedFields },
      },
      ctx,
    );
    if (!activityResult.success) {
      logger.error('Failed to log time-entry create activity {matterId}: {error}', {
        matterId,
        error: activityResult.error.message,
      });
    }

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
  params: { filters?: MatterTimeEntryListFilters },
  ctx: ServiceContext,
): Promise<Result<SelectMatterTimeEntry[]>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('read', 'Matter')) {
    return forbidden('You do not have permission to read this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Short-circuit: direct lookup when a specific entry ID is provided.
    // When entryId is set, other filters (billable, startDate, endDate) are
    // intentionally ignored — this path is for single-resource retrieval.
    if (params.filters?.entryId) {
      const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.filters.entryId);
      if (!entry || entry.matter_id !== matterId) return ok([]);
      return ok([entry]);
    }

    const entries = await matterTimeEntriesQueries.listMatterTimeEntries(matterId, params.filters);
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
  params: { entryId: string; data: UpdateMatterTimeEntryRequest },
  ctx: ServiceContext,
): Promise<Result<SelectMatterTimeEntry>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify entry exists and belongs to matter
    const entry: SelectMatterTimeEntry | undefined = await matterTimeEntriesQueries
      .findMatterTimeEntryById(params.entryId);
    if (!entry || entry.matter_id !== matterId) {
      return notFound('Time entry not found');
    }

    // Recalculate duration if times changed
    const startTime = params.data.start_time ? new Date(params.data.start_time) : entry.start_time;
    const endTime = params.data.end_time ? new Date(params.data.end_time) : entry.end_time;
    let nextDuration: number | undefined;
    if (params.data.start_time !== undefined || params.data.end_time !== undefined) {
      const durationResult = getValidatedDuration(startTime, endTime);
      if (!durationResult.success) {
        return durationResult;
      }
      nextDuration = durationResult.data.duration;
    }

    const updateData: Parameters<typeof matterTimeEntriesQueries.updateMatterTimeEntry>[1] = {
      ...(params.data.start_time && { start_time: startTime }),
      ...(params.data.end_time && { end_time: endTime }),
      ...(params.data.description !== undefined && { description: params.data.description }),
      ...(params.data.billable !== undefined && { billable: params.data.billable }),
      ...(nextDuration !== undefined && { duration: nextDuration }),
    };

    const updated = await matterTimeEntriesQueries.updateMatterTimeEntry(params.entryId, updateData);
    if (!updated) {
      return notFound('Time entry not found');
    }
    const changedFields = [];
    if (params.data.start_time && entry.start_time.toISOString() !== startTime.toISOString()) {
      changedFields.push('start_time');
    }
    if (params.data.end_time && entry.end_time.toISOString() !== endTime.toISOString()) {
      changedFields.push('end_time');
    }
    if (params.data.description !== undefined && params.data.description !== entry.description) {
      changedFields.push('description');
    }
    if (params.data.billable !== undefined && params.data.billable !== entry.billable) {
      changedFields.push('billable');
    }
    if (nextDuration !== undefined && entry.duration !== nextDuration) {
      changedFields.push('duration');
    }

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.TIME_ENTRY_UPDATED,
        description: `${userName} updated a time entry`,
        metadata: { changed_fields: changedFields },
      },
      ctx,
    );
    if (!activityResult.success) {
      logger.error('Failed to log time-entry update activity {entryId}: {error}', {
        entryId: params.entryId,
        error: activityResult.error.message,
      });
    }

    return ok(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update time entry {entryId}: {error}', {
      entryId: params.entryId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter time entry
 */
const deleteMatterTimeEntry = async (
  params: { entryId: string },
  ctx: ServiceContext,
): Promise<Result<{ success: true }>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('update', 'Matter')) {
    return forbidden('You do not have permission to update this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify entry exists and belongs to matter
    const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.entryId);
    if (!entry || entry.matter_id !== matterId) {
      return notFound('Time entry not found');
    }

    await matterTimeEntriesQueries.deleteMatterTimeEntry(params.entryId);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.TIME_ENTRY_DELETED,
        description: `${userName} deleted a time entry`,
        metadata: { changed_fields: ['deleted'] },
      },
      ctx,
    );
    if (!activityResult.success) {
      logger.error('Failed to log time-entry delete activity {entryId}: {error}', {
        entryId: params.entryId,
        error: activityResult.error.message,
      });
    }

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete time entry {entryId}: {error}', {
      entryId: params.entryId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Get time entry statistics
 */
const getTimeEntryStats = async (
  ctx: ServiceContext,
): Promise<Result<{
  totalBillableSeconds: number;
  totalSeconds: number;
  totalBillableHours: number;
  totalHours: number;
}>> => {
  const matterId = ctx.matterId;
  if (!matterId) {
    return internalError('Matter ID not found in context');
  }

  // CASL Check
  if (ctx.ability.cannot('read', 'Matter')) {
    return forbidden('You do not have permission to read this matter');
  }

  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
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
