import {
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  deleteTimeEntryRoute,
  getTimeEntryStatsRoute,
} from '@/modules/matters/routes';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const listTimeEntriesHandler: AppRouteHandler<typeof listTimeEntriesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await matterTimeEntriesService.listMatterTimeEntries(practice_id, id, user, c.req.header());
  
  if (result.success) {
    return response.ok(c, { timeEntries: result.data });
  }

  return response.fromResult(c, result);
};

export const createTimeEntryHandler: AppRouteHandler<typeof createTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService
    .createMatterTimeEntry(practice_id, id, validatedBody, user, c.req.header());

  if (result.success) {
    return response.created(c, { timeEntry: result.data });
  }

  return response.fromResult(c, result, 201);
};

export const updateTimeEntryHandler: AppRouteHandler<typeof updateTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, entryId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService.updateMatterTimeEntry(
    practice_id,
    id,
    entryId,
    validatedBody,
    user,
    c.req.header(),
  );

  if (result.success) {
    return response.ok(c, { timeEntry: result.data });
  }

  return response.fromResult(c, result);
};

export const deleteTimeEntryHandler: AppRouteHandler<typeof deleteTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, entryId } = c.req.valid('param');
  const result = await matterTimeEntriesService.deleteMatterTimeEntry(
    practice_id,
    id,
    entryId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const getTimeEntryStatsHandler: AppRouteHandler<typeof getTimeEntryStatsRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await matterTimeEntriesService.getTimeEntryStats(practice_id, id, user, c.req.header());
  return response.fromResult(c, result);
};
