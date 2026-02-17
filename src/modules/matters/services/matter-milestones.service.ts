import { getLogger } from '@logtape/logtape';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import type { SelectMatterMilestone } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterMilestoneListFilters } from '@/modules/matters/types/matter-filters.types';
import type {
  CreateMatterMilestoneRequest,
  UpdateMatterMilestoneRequest,
  ReorderMilestonesRequest,
} from '@/modules/matters/types/matter.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'milestones']);

/**
 * Create a matter milestone
 */
const createMatterMilestone = async (
  matterId: string,
  data: CreateMatterMilestoneRequest,
  ctx: ServiceContext,
): Promise<Result<SelectMatterMilestone>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const milestone = await matterMilestonesQueries.createMatterMilestone({
      matter_id: matterId,
      description: data.description,
      amount: data.amount,
      due_date: data.due_date,
      status: data.status,
      order: data.order,
    });
    const changedFields = ['description', 'amount', 'due_date', 'status', 'order'];

    // Log activity
    const amountFormatted = (data.amount / 100).toFixed(2);
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.MILESTONE_CREATED,
      `${userName} created milestone: ${data.description} ($${amountFormatted})`,
      ctx.userId,
      { amount: data.amount, due_date: data.due_date, changed_fields: changedFields },
    );

    return ok(milestone);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter milestone {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * List matter milestones
 */
const listMatterMilestones = async (
  matterId: string,
  filters: MatterMilestoneListFilters | undefined,
  ctx: ServiceContext,
): Promise<Result<SelectMatterMilestone[]>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Short-circuit: direct lookup when a specific milestone ID is provided
    if (filters?.milestoneId) {
      const milestone = await matterMilestonesQueries.findMatterMilestoneById(filters.milestoneId);
      if (!milestone || milestone.matter_id !== matterId) return ok([]);
      return ok([milestone]);
    }

    const milestones = await matterMilestonesQueries.listMatterMilestones(matterId, filters);
    return ok(milestones);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matter milestones {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Update matter milestone
 */
const updateMatterMilestone = async (
  matterId: string,
  milestoneId: string,
  data: UpdateMatterMilestoneRequest,
  ctx: ServiceContext,
): Promise<Result<SelectMatterMilestone>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify milestone exists and belongs to matter
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(milestoneId);
    if (!milestone || milestone.matter_id !== matterId) {
      return notFound('Milestone not found');
    }

    const updated = await matterMilestonesQueries.updateMatterMilestone(milestoneId, data);
    if (!updated) {
      return internalError('Failed to update milestone');
    }
    const changedFields: string[] = [];
    if (data.description !== undefined && data.description !== milestone.description) {
      changedFields.push('description');
    }
    if (data.amount !== undefined && data.amount !== milestone.amount) {
      changedFields.push('amount');
    }
    if (data.due_date !== undefined) {
      if ((data.due_date === null) !== (milestone.due_date === null)) {
        changedFields.push('due_date');
      } else if (data.due_date !== null && milestone.due_date !== null) {
        const nextDue = new Date(data.due_date);
        const currentDue = new Date(milestone.due_date);
        if (!Number.isNaN(nextDue.getTime()) && !Number.isNaN(currentDue.getTime())
          && nextDue.getTime() !== currentDue.getTime()) {
          changedFields.push('due_date');
        }
      }
    }
    if (data.status !== undefined && data.status !== milestone.status) {
      changedFields.push('status');
    }
    if (data.order !== undefined && data.order !== milestone.order) {
      changedFields.push('order');
    }

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.MILESTONE_UPDATED,
      `${userName} updated milestone: ${updated.description}`,
      ctx.userId,
      { changed_fields: changedFields },
    );

    // Check if milestone was marked as completed
    if (data.status === 'completed' && milestone.status !== 'completed') {
      await matterActivityService.logMatterActivity(
        matterId,
        matterActivityService.ActivityAction.MILESTONE_COMPLETED,
        `${userName} completed milestone: ${milestone.description}`,
        ctx.userId,
        { changed_fields: ['status'] },
      );
    }

    return ok(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter milestone {milestoneId}: {error}', {
      milestoneId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter milestone
 */
const deleteMatterMilestone = async (
  matterId: string,
  milestoneId: string,
  ctx: ServiceContext,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify milestone exists and belongs to matter
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(milestoneId);
    if (!milestone || milestone.matter_id !== matterId) {
      return notFound('Milestone not found');
    }

    await matterMilestonesQueries.deleteMatterMilestone(milestoneId);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.MILESTONE_DELETED,
      `${userName} deleted milestone: ${milestone.description}`,
      ctx.userId,
      { changed_fields: ['deleted'] },
    );

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter milestone {milestoneId}: {error}', {
      milestoneId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Reorder milestones
 */
const reorderMilestones = async (
  matterId: string,
  data: ReorderMilestonesRequest,
  ctx: ServiceContext,
): Promise<Result<{ success: true }>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    // Verify all milestones belong to this matter
    for (const item of data.milestones) {
      const milestone = await matterMilestonesQueries.findMatterMilestoneById(item.id);
      if (!milestone || milestone.matter_id !== matterId) {
        return notFound(`Milestone ${item.id} not found or does not belong to this matter`);
      }
    }

    await matterMilestonesQueries.reorderMilestones(data.milestones);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.MILESTONE_UPDATED,
      `${userName} reordered milestones`,
      ctx.userId,
      { changed_fields: ['order'] },
    );

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to reorder milestones {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Get milestone statistics
 */
const getMilestoneStats = async (
  matterId: string,
  ctx: ServiceContext,
): Promise<Result<{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  totalAmount: number;
  completedAmount: number;
  completionPercentage: number;
}>> => {
  // Verify user has access to matter
  const matterResult = await mattersService.getMatterById(matterId, ctx);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const stats = await matterMilestonesQueries.getMilestoneStats(matterId);

    return ok({
      ...stats,
      totalAmount: stats.totalAmount / 100,
      completedAmount: stats.completedAmount / 100,
      completionPercentage: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get milestone stats {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

export const matterMilestonesService = {
  createMatterMilestone,
  listMatterMilestones,
  updateMatterMilestone,
  deleteMatterMilestone,
  reorderMilestones,
  getMilestoneStats,
};
