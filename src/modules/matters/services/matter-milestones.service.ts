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
import { ok, internalError, notFound, forbidden } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'milestones']);

/**
 * Create a matter milestone
 */
const createMatterMilestone = async (
  params: { data: CreateMatterMilestoneRequest },
  ctx: ServiceContext,
): Promise<Result<SelectMatterMilestone>> => {
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
    const milestone = await matterMilestonesQueries.createMatterMilestone({
      matter_id: matterId,
      description: params.data.description,
      amount: params.data.amount,
      due_date: params.data.due_date,
      status: params.data.status,
      order: params.data.order,
    });
    const changedFields = ['description', 'amount', 'due_date', 'status', 'order'];

    // Log activity
    const amountFormatted = (params.data.amount / 100).toFixed(2);
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MILESTONE_CREATED,
        description: `${userName} created milestone: ${params.data.description} ($${amountFormatted})`,
        metadata: { amount: params.data.amount, due_date: params.data.due_date, changed_fields: changedFields },
      },
      ctx,
    );
    if (!activityResult.success) {
      logger.error('Failed to log milestone create activity {matterId}: {error}', {
        matterId,
        error: activityResult.error.message,
      });
    }

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
  params: { filters?: MatterMilestoneListFilters },
  ctx: ServiceContext,
): Promise<Result<SelectMatterMilestone[]>> => {
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
    // Short-circuit: direct lookup when a specific milestone ID is provided
    if (params.filters?.milestoneId) {
      const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.filters.milestoneId);
      if (!milestone || milestone.matter_id !== matterId) return ok([]);
      return ok([milestone]);
    }

    const milestones = await matterMilestonesQueries.listMatterMilestones(matterId, params.filters);
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
  params: { milestoneId: string; data: UpdateMatterMilestoneRequest },
  ctx: ServiceContext,
): Promise<Result<SelectMatterMilestone>> => {
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
    // Verify milestone exists and belongs to matter
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.milestoneId);
    if (!milestone || milestone.matter_id !== matterId) {
      return notFound('Milestone not found');
    }

    const updated = await matterMilestonesQueries.updateMatterMilestone(params.milestoneId, params.data);
    if (!updated) {
      return internalError('Failed to update milestone');
    }
    const changedFields: string[] = [];
    if (params.data.description !== undefined && params.data.description !== milestone.description) {
      changedFields.push('description');
    }
    if (params.data.amount !== undefined && params.data.amount !== milestone.amount) {
      changedFields.push('amount');
    }
    if (params.data.due_date !== undefined) {
      if ((params.data.due_date === null) !== (milestone.due_date === null)) {
        changedFields.push('due_date');
      } else if (params.data.due_date !== null && milestone.due_date !== null) {
        const nextDue = new Date(params.data.due_date);
        const currentDue = new Date(milestone.due_date);
        if (!Number.isNaN(nextDue.getTime()) && !Number.isNaN(currentDue.getTime())
          && nextDue.getTime() !== currentDue.getTime()) {
          changedFields.push('due_date');
        }
      }
    }
    if (params.data.status !== undefined && params.data.status !== milestone.status) {
      changedFields.push('status');
    }
    if (params.data.order !== undefined && params.data.order !== milestone.order) {
      changedFields.push('order');
    }

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MILESTONE_UPDATED,
        description: `${userName} updated milestone: ${updated.description}`,
        metadata: { changed_fields: changedFields },
      },
      ctx,
    );
    if (!activityResult.success) {
      logger.error('Failed to log milestone update activity {milestoneId}: {error}', {
        milestoneId: params.milestoneId,
        error: activityResult.error.message,
      });
    }

    // Check if milestone was marked as completed
    if (params.data.status === 'completed' && milestone.status !== 'completed') {
      const completionActivityResult = await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MILESTONE_COMPLETED,
          description: `${userName} completed milestone: ${milestone.description}`,
          metadata: { changed_fields: ['status'] },
        },
        ctx,
      );
      if (!completionActivityResult.success) {
        logger.error('Failed to log milestone completion activity {milestoneId}: {error}', {
          milestoneId: params.milestoneId,
          error: completionActivityResult.error.message,
        });
      }
    }

    return ok(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter milestone {milestoneId}: {error}', {
      milestoneId: params.milestoneId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter milestone
 */
const deleteMatterMilestone = async (
  params: { milestoneId: string },
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
    // Verify milestone exists and belongs to matter
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.milestoneId);
    if (!milestone || milestone.matter_id !== matterId) {
      return notFound('Milestone not found');
    }

    await matterMilestonesQueries.deleteMatterMilestone(params.milestoneId);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MILESTONE_DELETED,
        description: `${userName} deleted milestone: ${milestone.description}`,
        metadata: { changed_fields: ['deleted'] },
      },
      ctx,
    );
    if (!activityResult.success) {
      logger.error('Failed to log milestone delete activity {milestoneId}: {error}', {
        milestoneId: params.milestoneId,
        error: activityResult.error.message,
      });
    }

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter milestone {milestoneId}: {error}', {
      milestoneId: params.milestoneId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Reorder milestones
 */
const reorderMilestones = async (
  params: { data: ReorderMilestonesRequest },
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
    // Verify all milestones belong to this matter
    for (const item of params.data.milestones) {
      const milestone = await matterMilestonesQueries.findMatterMilestoneById(item.id);
      if (!milestone || milestone.matter_id !== matterId) {
        return notFound(`Milestone ${item.id} not found or does not belong to this matter`);
      }
    }

    await matterMilestonesQueries.reorderMilestones(params.data.milestones);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MILESTONE_UPDATED,
        description: `${userName} reordered milestones`,
        metadata: { changed_fields: ['order'] },
      },
      ctx,
    );
    if (!activityResult.success) {
      logger.error('Failed to log milestone reorder activity {matterId}: {error}', {
        matterId,
        error: activityResult.error.message,
      });
    }

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
