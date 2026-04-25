import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import type { SelectMatterTimeEntry } from '@/modules/matters/database/schema/matter-time-entries.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterTimeEntryListFilters } from '@/modules/matters/types/matter-filters.types';
import type { CreateMatterTimeEntryRequest, UpdateMatterTimeEntryRequest } from '@/modules/matters/types/matter.types';
import type { ServiceContext } from '@/shared/types/service-context';

/**
 * Calculate duration in seconds between two dates
 */
const calculateDuration = (startTime: Date, endTime: Date): number =>
  Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

const getValidatedDuration = (startTime: Date, endTime: Date): number => {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new HTTPException(400, { message: 'start_time and end_time must be valid dates' });
  }
  if (endTime <= startTime) {
    throw new HTTPException(400, { message: 'end_time must be after start_time' });
  }
  return calculateDuration(startTime, endTime);
};

/**
 * Create a matter time entry
 */
const createMatterTimeEntry = async (
  params: { data: CreateMatterTimeEntryRequest },
  ctx: ServiceContext
): Promise<SelectMatterTimeEntry> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const startTime = new Date(params.data.start_time);
  const endTime = new Date(params.data.end_time);
  const duration = getValidatedDuration(startTime, endTime);

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

  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TIME_ENTRY_ADDED,
      description: `${userName} logged ${hours}h ${minutes}m${params.data.billable ? ' (billable)' : ''}`,
      metadata: { duration, billable: params.data.billable, changed_fields: changedFields },
    },
    ctx
  );

  return entry;
};

/**
 * List matter time entries
 */
const listMatterTimeEntries = async (
  params: { filters?: MatterTimeEntryListFilters },
  ctx: ServiceContext
): Promise<SelectMatterTimeEntry[]> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  if (params.filters?.entryId) {
    const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.filters.entryId);
    if (!entry || entry.matter_id !== matterId) return [];
    return [entry];
  }

  return matterTimeEntriesQueries.listMatterTimeEntries(matterId, params.filters);
};

/**
 * Update matter time entry
 */
const updateMatterTimeEntry = async (
  params: { entryId: string; data: UpdateMatterTimeEntryRequest },
  ctx: ServiceContext
): Promise<SelectMatterTimeEntry> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.entryId);
  if (!entry || entry.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Time entry not found' });
  }

  const startTime = params.data.start_time ? new Date(params.data.start_time) : entry.start_time;
  const endTime = params.data.end_time ? new Date(params.data.end_time) : entry.end_time;
  let nextDuration: number | undefined;
  if (params.data.start_time !== undefined || params.data.end_time !== undefined) {
    nextDuration = getValidatedDuration(startTime, endTime);
  }

  const updateData: Parameters<typeof matterTimeEntriesQueries.updateMatterTimeEntry>[1] = {
    ...(params.data.start_time && { start_time: startTime }),
    ...(params.data.end_time && { end_time: endTime }),
    ...(params.data.description !== undefined && { description: params.data.description }),
    ...(params.data.billable !== undefined && { billable: params.data.billable }),
    ...(nextDuration !== undefined && { duration: nextDuration }),
  };

  const updated = await matterTimeEntriesQueries.updateMatterTimeEntry(params.entryId, updateData);
  if (!updated) throw new HTTPException(404, { message: 'Time entry not found' });

  const changedFields = [];
  if (params.data.start_time && entry.start_time.toISOString() !== startTime.toISOString())
    changedFields.push('start_time');
  if (params.data.end_time && entry.end_time.toISOString() !== endTime.toISOString()) changedFields.push('end_time');
  if (params.data.description !== undefined && params.data.description !== entry.description)
    changedFields.push('description');
  if (params.data.billable !== undefined && params.data.billable !== entry.billable) changedFields.push('billable');
  if (nextDuration !== undefined && entry.duration !== nextDuration) changedFields.push('duration');

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TIME_ENTRY_UPDATED,
      description: `${userName} updated a time entry`,
      metadata: { changed_fields: changedFields },
    },
    ctx
  );

  return updated;
};

/**
 * Delete matter time entry
 */
const deleteMatterTimeEntry = async (params: { entryId: string }, ctx: ServiceContext): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.entryId);
  if (!entry || entry.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Time entry not found' });
  }

  await matterTimeEntriesQueries.deleteMatterTimeEntry(params.entryId);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TIME_ENTRY_DELETED,
      description: `${userName} deleted a time entry`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};

/**
 * Get time entry statistics
 */
const getTimeEntryStats = async (
  ctx: ServiceContext
): Promise<{
  totalBillableSeconds: number;
  totalSeconds: number;
  totalBillableHours: number;
  totalHours: number;
}> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const totalBillable = await matterTimeEntriesQueries.getTotalBillableTime(matterId);
  const totalTime = await matterTimeEntriesQueries.getTotalTime(matterId);

  return {
    totalBillableSeconds: totalBillable,
    totalSeconds: totalTime,
    totalBillableHours: totalBillable / 3600,
    totalHours: totalTime / 3600,
  };
};

export const matterTimeEntriesService = {
  createMatterTimeEntry,
  listMatterTimeEntries,
  updateMatterTimeEntry,
  deleteMatterTimeEntry,
  getTimeEntryStats,
};
