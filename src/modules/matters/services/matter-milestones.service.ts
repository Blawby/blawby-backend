/**
 * Matter Milestones Service
 *
 * Handles business logic for matter milestones operations
 */

import * as milestonesQueries from '../database/queries/matter-milestones.queries';
import { getMatterById } from './matters.service';
import type { User } from '@/shared/types/BetterAuth';
import type {
  CreateMatterMilestoneRequest,
  UpdateMatterMilestoneRequest,
  ReorderMilestonesRequest,
} from '../validations/matter-milestones.validation';
import { logMatterActivity, ActivityAction } from './matter-activity.service';

/**
 * Create a matter milestone
 */
export const createMatterMilestone = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterMilestoneRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  const milestone = await milestonesQueries.createMatterMilestone({
    matterId,
    description: data.description,
    amount: data.amount,
    dueDate: typeof data.dueDate === 'string' ? data.dueDate : data.dueDate.toISOString().split('T')[0],
    status: data.status,
    order: data.order,
  });

  // Log activity
  const amountFormatted = (data.amount / 100).toFixed(2);
  await logMatterActivity(
    matterId,
    ActivityAction.MILESTONE_CREATED,
    `${user.name || user.email} created milestone: ${data.description} ($${amountFormatted})`,
    user.id,
    { amount: data.amount, dueDate: data.dueDate },
  );

  return milestone;
};

/**
 * List matter milestones
 */
export const listMatterMilestones = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  return await milestonesQueries.listMatterMilestones(matterId);
};

/**
 * Update matter milestone
 */
export const updateMatterMilestone = async (
  organizationId: string,
  matterId: string,
  milestoneId: string,
  data: UpdateMatterMilestoneRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify milestone exists and belongs to matter
  const milestone = await milestonesQueries.findMatterMilestoneById(milestoneId);
  if (!milestone || milestone.matterId !== matterId) {
    throw new Error('Milestone not found');
  }

  // Convert date if provided
  const updateData = {
    ...data,
    dueDate: data.dueDate
      ? typeof data.dueDate === 'string'
        ? data.dueDate
        : data.dueDate.toISOString().split('T')[0]
      : undefined,
  };

  const updated = await milestonesQueries.updateMatterMilestone(milestoneId, updateData);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.MILESTONE_UPDATED,
    `${user.name || user.email} updated milestone: ${updated!.description}`,
    user.id,
  );

  // Check if milestone was marked as completed
  if (data.status === 'completed' && milestone.status !== 'completed') {
    await logMatterActivity(
      matterId,
      ActivityAction.MILESTONE_COMPLETED,
      `${user.name || user.email} completed milestone: ${milestone.description}`,
      user.id,
    );
  }

  return updated;
};

/**
 * Delete matter milestone
 */
export const deleteMatterMilestone = async (
  organizationId: string,
  matterId: string,
  milestoneId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify milestone exists and belongs to matter
  const milestone = await milestonesQueries.findMatterMilestoneById(milestoneId);
  if (!milestone || milestone.matterId !== matterId) {
    throw new Error('Milestone not found');
  }

  await milestonesQueries.deleteMatterMilestone(milestoneId);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.MILESTONE_DELETED,
    `${user.name || user.email} deleted milestone: ${milestone.description}`,
    user.id,
  );
};

/**
 * Reorder milestones
 */
export const reorderMilestones = async (
  organizationId: string,
  matterId: string,
  data: ReorderMilestonesRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  // Verify all milestones belong to this matter
  for (const item of data.milestones) {
    const milestone = await milestonesQueries.findMatterMilestoneById(item.id);
    if (!milestone || milestone.matterId !== matterId) {
      throw new Error(`Milestone ${item.id} not found or does not belong to this matter`);
    }
  }

  await milestonesQueries.reorderMilestones(data.milestones);

  // Log activity
  await logMatterActivity(
    matterId,
    ActivityAction.MILESTONE_UPDATED,
    `${user.name || user.email} reordered milestones`,
    user.id,
  );
};

/**
 * Get milestone statistics
 */
export const getMilestoneStats = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to matter
  await getMatterById(organizationId, matterId, user, requestHeaders);

  const stats = await milestonesQueries.getMilestoneStats(matterId);

  return {
    ...stats,
    totalAmount: stats.totalAmount / 100,
    completedAmount: stats.completedAmount / 100,
    completionPercentage: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
  };
};
