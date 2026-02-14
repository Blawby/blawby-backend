import { z } from '@hono/zod-openapi';
import {
  createMatterRoute,
  getMattersRoute,
  updateMatterRoute,
  deleteMatterRoute,
  getMatterActivityRoute,
  listMatterNotesRoute,
  createMatterNoteRoute,
  updateMatterNoteRoute,
  deleteMatterNoteRoute,
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  deleteTimeEntryRoute,
  getTimeEntryStatsRoute,
  listExpensesRoute,
  createExpenseRoute,
  updateExpenseRoute,
  deleteExpenseRoute,
  listMilestonesRoute,
  createMilestoneRoute,
  updateMilestoneRoute,
  deleteMilestoneRoute,
  reorderMilestonesRoute,
} from '@/modules/matters/routes';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { matterExpensesService } from '@/modules/matters/services/matter-expenses.service';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import { matterExpenseValidations } from '@/modules/matters/validations/matter-expenses.validation';
import { matterMilestoneValidations } from '@/modules/matters/validations/matter-milestones.validation';
import { matterNoteValidations } from '@/modules/matters/validations/matter-notes.validation';
import { matterTimeEntryValidations } from '@/modules/matters/validations/matter-time-entries.validation';
import { matterValidations } from '@/modules/matters/validations/matters.validation';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const createMatterHandler: AppRouteHandler<typeof createMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');

  const result = await mattersService.createMatter(
    practice_id,
    validatedBody,
    user,
    c.req.header(),
  );

  if (result.success) {
    return response.created(c, { matter: result.data });
  }

  return response.fromResult(c, result);
};

export const getMattersHandler: AppRouteHandler<typeof getMattersRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await mattersService.listMatters(practice_id, {
    ...query,
    page: parseInt(String(query.page ?? '1'), 10),
    limit: parseInt(String(query.limit ?? '20'), 10),
  }, user, c.req.header());

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, {
    matters: result.data.matters,
    total: result.data.total,
    page: parseInt(String(query.page ?? '1'), 10),
    limit: parseInt(String(query.limit ?? '20'), 10),
    totalPages: Math.ceil(result.data.total / parseInt(String(query.limit ?? '20'), 10)),
  });
};


export const updateMatterHandler: AppRouteHandler<typeof updateMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await mattersService.updateMatter(practice_id, id, validatedBody, user, c.req.header());

  if (result.success) {
    return response.ok(c, { matter: result.data });
  }

  return response.fromResult(c, result);
};

export const deleteMatterHandler: AppRouteHandler<typeof deleteMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await mattersService.deleteMatter(practice_id, id, user, c.req.header());
  return response.fromResult(c, result);
};

export const getMatterActivityHandler: AppRouteHandler<typeof getMatterActivityRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const result = await mattersService.getMatterById(practice_id, id, user, c.req.header());
  if (!result.success) {
    return response.fromResult(c, result);
  }
  const query = c.req.valid('query') as z.infer<typeof matterValidations.getActivityLogQuerySchema>;
  const activityResult = await matterActivityService.getMatterActivity(id, query);
  return response.fromResult(c, activityResult);
};

export const listMatterNotesHandler: AppRouteHandler<typeof listMatterNotesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query') as z.infer<typeof matterNoteValidations.listMatterNotesQuerySchema>;
  const result = await matterNotesService.listMatterNotes(practice_id, id, user, c.req.header(), query);
  return response.fromResult(c, result);
};

export const createMatterNoteHandler: AppRouteHandler<typeof createMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterNotesService.createMatterNote(practice_id, id, validatedBody, user, c.req.header());
  return response.fromResult(c, result, 201);
};

export const updateMatterNoteHandler: AppRouteHandler<typeof updateMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, noteId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterNotesService.updateMatterNote(
    practice_id,
    id,
    noteId,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteMatterNoteHandler: AppRouteHandler<typeof deleteMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, noteId } = c.req.valid('param');
  const result = await matterNotesService.deleteMatterNote(practice_id, id, noteId, user, c.req.header());
  return response.fromResult(c, result);
};

export const listTimeEntriesHandler: AppRouteHandler<typeof listTimeEntriesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query') as z.infer<typeof matterTimeEntryValidations.listTimeEntriesQuerySchema>;
  const result = await matterTimeEntriesService.listMatterTimeEntries(practice_id, id, user, c.req.header(), query);
  return response.fromResult(c, result);
};

export const createTimeEntryHandler: AppRouteHandler<typeof createTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService
    .createMatterTimeEntry(practice_id, id, validatedBody, user, c.req.header());
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

export const listExpensesHandler: AppRouteHandler<typeof listExpensesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query') as z.infer<typeof matterExpenseValidations.listExpensesQuerySchema>;
  const result = await matterExpensesService.listMatterExpenses(practice_id, id, user, c.req.header(), query);
  return response.fromResult(c, result);
};

export const createExpenseHandler: AppRouteHandler<typeof createExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService
    .createMatterExpense(practice_id, id, validatedBody, user, c.req.header());
  return response.fromResult(c, result, 201);
};

export const updateExpenseHandler: AppRouteHandler<typeof updateExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, expenseId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService.updateMatterExpense(
    practice_id,
    id,
    expenseId,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteExpenseHandler: AppRouteHandler<typeof deleteExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, expenseId } = c.req.valid('param');
  const result = await matterExpensesService.deleteMatterExpense(
    practice_id,
    id,
    expenseId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const listMilestonesHandler: AppRouteHandler<typeof listMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query') as z.infer<typeof matterMilestoneValidations.listMilestonesQuerySchema>;
  const result = await matterMilestonesService.listMatterMilestones(practice_id, id, user, c.req.header(), query);
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
