import {
  createMatterRoute,
  getMatterRoute,
  updateMatterRoute,
  deleteMatterRoute,
  getMatterActivityRoute,
  listMatterNotesRoute,
  createMatterNoteRoute,
  listTimeEntriesRoute,
  createTimeEntryRoute,
  getTimeEntryStatsRoute,
  listExpensesRoute,
  createExpenseRoute,
  listMilestonesRoute,
  createMilestoneRoute,
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
  await mattersService.getMatterById(practice_id, uuid, user, c.req.header());
  const activity = await getMatterActivity(uuid);
  return response.ok(c, activity);
};

export const listMatterNotesHandler: AppRouteHandler<typeof listMatterNotesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const notes = await notesService.listMatterNotes(practice_id, uuid, user, c.req.header());
  return response.ok(c, notes);
};

export const createMatterNoteHandler: AppRouteHandler<typeof createMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const note = await notesService.createMatterNote(practice_id, uuid, validatedBody, user, c.req.header());
  return response.created(c, note);
};

export const listTimeEntriesHandler: AppRouteHandler<typeof listTimeEntriesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const timeEntries = await timeEntriesService.listMatterTimeEntries(practice_id, uuid, user, c.req.header());
  return response.ok(c, timeEntries);
};

export const createTimeEntryHandler: AppRouteHandler<typeof createTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const timeEntry = await timeEntriesService
    .createMatterTimeEntry(practice_id, uuid, validatedBody, user, c.req.header());
  return response.created(c, timeEntry);
};

export const getTimeEntryStatsHandler: AppRouteHandler<typeof getTimeEntryStatsRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const stats = await timeEntriesService.getTimeEntryStats(practice_id, uuid, user, c.req.header());
  return response.ok(c, stats);
};

export const listExpensesHandler: AppRouteHandler<typeof listExpensesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const expenses = await expensesService.listMatterExpenses(practice_id, uuid, user, c.req.header());
  return response.ok(c, expenses);
};

export const createExpenseHandler: AppRouteHandler<typeof createExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const expense = await expensesService.createMatterExpense(practice_id, uuid, validatedBody, user, c.req.header());
  return response.created(c, expense);
};

export const listMilestonesHandler: AppRouteHandler<typeof listMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const milestones = await milestonesService.listMatterMilestones(practice_id, uuid, user, c.req.header());
  return response.ok(c, milestones);
};

export const createMilestoneHandler: AppRouteHandler<typeof createMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const milestone = await milestonesService.createMatterMilestone(
    practice_id,
    uuid,
    {
      ...validatedBody,
      order: validatedBody.order ?? 0,
    },
    user,
    c.req.header(),
  );
  return response.created(c, milestone);
};

export const reorderMilestonesHandler: AppRouteHandler<typeof reorderMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  await milestonesService.reorderMilestones(practice_id, uuid, validatedBody, user, c.req.header());
  return response.ok(c, { success: true });
};
