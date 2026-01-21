/**
 * Matter Time Entries Service
 *
 * Handles business logic for matter time entries operations
 */

import * as timeEntriesQueries from '../database/queries/matter-time-entries.queries';
import { getMatterById } from './matters.service';
import type { User } from '@/shared/types/BetterAuth';
import type {
  CreateMatterTimeEntryRequest,
  UpdateMatterTimeEntryRequest,
} from '../validations/matter-time-entries.validation';
import { logMatterActivity, ActivityAction } from './matter-activity.service';

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
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);
  const duration = calculateDuration(startTime, endTime);

  const entry = await timeEntriesQueries.createMatterTimeEntry({
    matterId,
    userId: user.id,
    startTime,
    endTime,
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

  return entry;
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
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  return await timeEntriesQueries.listMatterTimeEntries(matterId, filters);
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
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify entry exists and belongs to matter
  const entry = await timeEntriesQueries.findMatterTimeEntryById(entryId);
  if (!entry || entry.matterId !== matterId) {
    throw new Error('Time entry not found');
  }

  // Recalculate duration if times changed
  let updateData = { ...data };
  if (data.startTime || data.endTime) {
    const startTime = data.startTime ? new Date(data.startTime) : entry.startTime;
    const endTime = data.endTime ? new Date(data.endTime) : entry.endTime;
    updateData = {
      ...updateData,
      duration: calculateDuration(startTime, endTime),
    };
  }

  const updated = await timeEntriesQueries.updateMatterTimeEntry(entryId, updateData);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.TIME_ENTRY_UPDATED,
    `${user.name || user.email} updated a time entry`,
    user.id,
  );

  return updated;
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
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify entry exists and belongs to matter
  const entry = await timeEntriesQueries.findMatterTimeEntryById(entryId);
  if (!entry || entry.matterId !== matterId) {
    throw new Error('Time entry not found');
  }

  await timeEntriesQueries.deleteMatterTimeEntry(entryId);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.TIME_ENTRY_DELETED,
    `${user.name || user.email} deleted a time entry`,
    user.id,
  );
};

/**
 * Get time entry statistics
 */
export const getTimeEntryStats = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  const totalBillable = await timeEntriesQueries.getTotalBillableTime(matterId);
  const totalTime = await timeEntriesQueries.getTotalTime(matterId);

  return {
    totalBillableSeconds: totalBillable,
    totalSeconds: totalTime,
    totalBillableHours: totalBillable / 3600,
    totalHours: totalTime / 3600,
  };
};
