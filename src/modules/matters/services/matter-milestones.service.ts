import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
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
import type { ServiceContext } from '@/shared/types/service-context';

/**
 * Create a matter milestone
 */
const createMatterMilestone = async (
  params: { data: CreateMatterMilestoneRequest },
  ctx: ServiceContext
): Promise<SelectMatterMilestone> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const milestone = await matterMilestonesQueries.createMatterMilestone({
    matter_id: matterId,
    description: params.data.description,
    amount: params.data.amount,
    due_date: params.data.due_date,
    status: params.data.status,
    order: params.data.order,
  });

  const amountFormatted = (params.data.amount / 100).toFixed(2);
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_CREATED,
      description: `${userName} created milestone: ${params.data.description} ($${amountFormatted})`,
      metadata: {
        amount: params.data.amount,
        due_date: params.data.due_date,
        changed_fields: ['description', 'amount', 'due_date', 'status', 'order'],
      },
    },
    ctx
  );

  return milestone;
};

/**
 * List matter milestones
 */
const listMatterMilestones = async (
  params: { filters?: MatterMilestoneListFilters },
  ctx: ServiceContext
): Promise<SelectMatterMilestone[]> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  if (params.filters?.milestoneId) {
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.filters.milestoneId);
    if (!milestone || milestone.matter_id !== matterId) return [];
    return [milestone];
  }

  return matterMilestonesQueries.listMatterMilestones(matterId, params.filters);
};

/**
 * Update matter milestone
 */
const updateMatterMilestone = async (
  params: { milestoneId: string; data: UpdateMatterMilestoneRequest },
  ctx: ServiceContext
): Promise<SelectMatterMilestone> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.milestoneId);
  if (!milestone || milestone.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Milestone not found' });
  }

  const updated = await matterMilestonesQueries.updateMatterMilestone(params.milestoneId, params.data);
  if (!updated) throw new HTTPException(500, { message: 'Failed to update milestone' });

  const changedFields: string[] = [];
  if (params.data.description !== undefined && params.data.description !== milestone.description)
    changedFields.push('description');
  if (params.data.amount !== undefined && params.data.amount !== milestone.amount) changedFields.push('amount');
  if (params.data.status !== undefined && params.data.status !== milestone.status) changedFields.push('status');
  if (params.data.order !== undefined && params.data.order !== milestone.order) changedFields.push('order');
  if (params.data.due_date !== undefined) {
    const nextDue = params.data.due_date ? new Date(params.data.due_date) : null;
    const currentDue = milestone.due_date ? new Date(milestone.due_date) : null;
    if (nextDue?.getTime() !== currentDue?.getTime()) changedFields.push('due_date');
  }

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_UPDATED,
      description: `${userName} updated milestone: ${updated.description}`,
      metadata: { changed_fields: changedFields },
    },
    ctx
  );

  if (params.data.status === 'completed' && milestone.status !== 'completed') {
    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MILESTONE_COMPLETED,
        description: `${userName} completed milestone: ${milestone.description}`,
        metadata: { changed_fields: ['status'] },
      },
      ctx
    );
  }

  return updated;
};

/**
 * Delete matter milestone
 */
const deleteMatterMilestone = async (params: { milestoneId: string }, ctx: ServiceContext): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.milestoneId);
  if (!milestone || milestone.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Milestone not found' });
  }

  await matterMilestonesQueries.deleteMatterMilestone(params.milestoneId);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_DELETED,
      description: `${userName} deleted milestone: ${milestone.description}`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};

/**
 * Reorder milestones
 */
const reorderMilestones = async (params: { data: ReorderMilestonesRequest }, ctx: ServiceContext): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  for (const item of params.data.milestones) {
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(item.id);
    if (!milestone || milestone.matter_id !== matterId) {
      throw new HTTPException(404, { message: `Milestone ${item.id} not found or does not belong to this matter` });
    }
  }

  await matterMilestonesQueries.reorderMilestones(params.data.milestones);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_UPDATED,
      description: `${userName} reordered milestones`,
      metadata: { changed_fields: ['order'] },
    },
    ctx
  );
};

/**
 * Get milestone statistics
 */
const getMilestoneStats = async (
  ctx: ServiceContext
): Promise<{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  totalAmount: number;
  completedAmount: number;
  completionPercentage: number;
}> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const stats = await matterMilestonesQueries.getMilestoneStats(matterId);

  return {
    ...stats,
    totalAmount: stats.totalAmount / 100,
    completedAmount: stats.completedAmount / 100,
    completionPercentage: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
  };
};

export const matterMilestonesService = {
  createMatterMilestone,
  listMatterMilestones,
  updateMatterMilestone,
  deleteMatterMilestone,
  reorderMilestones,
  getMilestoneStats,
};
