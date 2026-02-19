import {
  listMilestonesRoute,
  createMilestoneRoute,
  updateMilestoneRoute,
  deleteMilestoneRoute,
  reorderMilestonesRoute,
} from '@/modules/matters/routes';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const listMilestonesHandler: AppRouteHandler<typeof listMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await matterMilestonesService.listMatterMilestones(practice_id, id, user, c.req.header());
  
  if (result.success) {
    return response.ok(c, { milestones: result.data });
  }
  
  return response.fromResult(c, result);
};

export const createMilestoneHandler: AppRouteHandler<typeof createMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService.createMatterMilestone(
    practice_id,
    id,
    {
      ...validatedBody,
      order: validatedBody.order ?? 0,
    },
    user,
    c.req.header(),
  );

  if (result.success) {
    return response.created(c, { milestone: result.data });
  }

  return response.fromResult(c, result, 201);
};

export const updateMilestoneHandler: AppRouteHandler<typeof updateMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, milestoneId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService.updateMatterMilestone(
    practice_id,
    id,
    milestoneId,
    validatedBody,
    user,
    c.req.header(),
  );

  if (result.success) {
    return response.ok(c, { milestone: result.data });
  }

  return response.fromResult(c, result);
};

export const deleteMilestoneHandler: AppRouteHandler<typeof deleteMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, milestoneId } = c.req.valid('param');
  const result = await matterMilestonesService.deleteMatterMilestone(
    practice_id,
    id,
    milestoneId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const reorderMilestonesHandler: AppRouteHandler<typeof reorderMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService
    .reorderMilestones(practice_id, id, validatedBody, user, c.req.header());
  return response.fromResult(c, result);
};
