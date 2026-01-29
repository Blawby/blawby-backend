import {
  createMatterRoute,
  getMatterRoute,
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
import { getMatterActivity } from '@/modules/matters/services/matter-activity.service';
import * as expensesService from '@/modules/matters/services/matter-expenses.service';
import * as milestonesService from '@/modules/matters/services/matter-milestones.service';
import * as notesService from '@/modules/matters/services/matter-notes.service';
import * as timeEntriesService from '@/modules/matters/services/matter-time-entries.service';
import * as mattersService from '@/modules/matters/services/matters.service';
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

export const getMatterHandler: AppRouteHandler<typeof getMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id } = c.req.valid('param');
  const query = c.req.valid('query');

  if (query.matter_uuid) {
    const result = await mattersService.getMatterById(practice_id, query.matter_uuid, user, c.req.header());
    return response.fromResult(c, result);
  }

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
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await mattersService.updateMatter(practice_id, uuid, validatedBody, user, c.req.header());

  if (result.success) {
    return response.ok(c, { matter: result.data });
  }

  return response.fromResult(c, result);
};

export const deleteMatterHandler: AppRouteHandler<typeof deleteMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const result = await mattersService.deleteMatter(practice_id, uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const getMatterActivityHandler: AppRouteHandler<typeof getMatterActivityRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const result = await mattersService.getMatterById(practice_id, uuid, user, c.req.header());
  if (!result.success) {
    return response.fromResult(c, result);
  }
  const activityResult = await getMatterActivity(uuid);
  return response.fromResult(c, activityResult);
};

export const listMatterNotesHandler: AppRouteHandler<typeof listMatterNotesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const result = await notesService.listMatterNotes(practice_id, uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const createMatterNoteHandler: AppRouteHandler<typeof createMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await notesService.createMatterNote(practice_id, uuid, validatedBody, user, c.req.header());
  return response.fromResult(c, result, 201);
};

export const updateMatterNoteHandler: AppRouteHandler<typeof updateMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid, noteId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await notesService.updateMatterNote(
    practice_id,
    uuid,
    noteId,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteMatterNoteHandler: AppRouteHandler<typeof deleteMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid, noteId } = c.req.valid('param');
  const result = await notesService.deleteMatterNote(practice_id, uuid, noteId, user, c.req.header());
  return response.fromResult(c, result);
};

export const listTimeEntriesHandler: AppRouteHandler<typeof listTimeEntriesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const result = await timeEntriesService.listMatterTimeEntries(practice_id, uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const createTimeEntryHandler: AppRouteHandler<typeof createTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await timeEntriesService
    .createMatterTimeEntry(practice_id, uuid, validatedBody, user, c.req.header());
  return response.fromResult(c, result, 201);
};

export const updateTimeEntryHandler: AppRouteHandler<typeof updateTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid, entryId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await timeEntriesService.updateMatterTimeEntry(
    practice_id,
    uuid,
    entryId,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteTimeEntryHandler: AppRouteHandler<typeof deleteTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid, entryId } = c.req.valid('param');
  const result = await timeEntriesService.deleteMatterTimeEntry(
    practice_id,
    uuid,
    entryId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const getTimeEntryStatsHandler: AppRouteHandler<typeof getTimeEntryStatsRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const result = await timeEntriesService.getTimeEntryStats(practice_id, uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const listExpensesHandler: AppRouteHandler<typeof listExpensesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const result = await expensesService.listMatterExpenses(practice_id, uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const createExpenseHandler: AppRouteHandler<typeof createExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await expensesService.createMatterExpense(practice_id, uuid, validatedBody, user, c.req.header());
  return response.fromResult(c, result, 201);
};

export const updateExpenseHandler: AppRouteHandler<typeof updateExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid, expenseId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await expensesService.updateMatterExpense(
    practice_id,
    uuid,
    expenseId,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteExpenseHandler: AppRouteHandler<typeof deleteExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid, expenseId } = c.req.valid('param');
  const result = await expensesService.deleteMatterExpense(
    practice_id,
    uuid,
    expenseId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const listMilestonesHandler: AppRouteHandler<typeof listMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const result = await milestonesService.listMatterMilestones(practice_id, uuid, user, c.req.header());
  return response.fromResult(c, result);
};

export const createMilestoneHandler: AppRouteHandler<typeof createMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await milestonesService.createMatterMilestone(
    practice_id,
    uuid,
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
  const { practice_id, uuid, milestoneId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await milestonesService.updateMatterMilestone(
    practice_id,
    uuid,
    milestoneId,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteMilestoneHandler: AppRouteHandler<typeof deleteMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid, milestoneId } = c.req.valid('param');
  const result = await milestonesService.deleteMatterMilestone(
    practice_id,
    uuid,
    milestoneId,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const reorderMilestonesHandler: AppRouteHandler<typeof reorderMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await milestonesService.reorderMilestones(practice_id, uuid, validatedBody, user, c.req.header());
  return response.fromResult(c, result);
};
