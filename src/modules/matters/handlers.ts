import type { routes as matterRoutes } from '@/modules/matters/routes';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { matterExpensesService } from '@/modules/matters/services/matter-expenses.service';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';

const createMatterHandler: AppRouteHandler<typeof matterRoutes.createMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');

  const result = await mattersService.createMatter(validatedBody, ctx);

  return sendResult(c, result, 201);
};

const listMattersHandler: AppRouteHandler<typeof matterRoutes.listMattersRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  const page = parseInt(String(query.page ?? '1'), 10);
  const limit = parseInt(String(query.limit ?? '20'), 10);
  const result = await mattersService.listMatters({ ...query, page, limit }, ctx);

  if (!result.success) {
    return sendResult(c, result);
  }

  return c.json(
    {
      matters: result.data.matters,
      total: result.data.total,
      page,
      limit,
      totalPages: Math.ceil(result.data.total / limit),
    },
    200
  );
};

const getMatterHandler: AppRouteHandler<typeof matterRoutes.getMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');

  const result = await mattersService.getMatterById(id, ctx);
  if (!result.success) {
    return sendResult(c, result);
  }
  return c.json({ matter: result.data }, 200);
};

const updateMatterHandler: AppRouteHandler<typeof matterRoutes.updateMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await mattersService.updateMatter(id, validatedBody, ctx);

  return sendResult(c, result);
};

const deleteMatterHandler: AppRouteHandler<typeof matterRoutes.deleteMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const result = await mattersService.deleteMatter(id, ctx);
  return sendResult(c, result);
};

// Matter resource handlers

const getMatterActivityHandler: AppRouteHandler<typeof matterRoutes.getMatterActivityRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');

  const activityResult = await matterActivityService.getMatterActivity(
    {
      limit: query.limit,
      offset: query.offset,
      activityId: query.activity_id,
    },
    scopedCtx
  );

  if (!activityResult.success) {
    return sendResult(c, activityResult);
  }

  return c.json({ activities: activityResult.data }, 200);
};

const listMatterNotesHandler: AppRouteHandler<typeof matterRoutes.listMatterNotesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const notes = await matterNotesService.listMatterNotes({ filters: { noteId: query.note_id } }, scopedCtx);
  return c.json(notes, 200);
};

const createMatterNoteHandler: AppRouteHandler<typeof matterRoutes.createMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const note = await matterNotesService.createMatterNote({ data: validatedBody }, scopedCtx);
  return c.json(note, 201);
};

const updateMatterNoteHandler: AppRouteHandler<typeof matterRoutes.updateMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const note = await matterNotesService.updateMatterNote({ noteId: note_id, data: validatedBody }, scopedCtx);
  return c.json(note, 200);
};

const deleteMatterNoteHandler: AppRouteHandler<typeof matterRoutes.deleteMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterNotesService.deleteMatterNote({ noteId: note_id }, scopedCtx);
  return c.json({ success: true }, 200);
};

const listTimeEntriesHandler: AppRouteHandler<typeof matterRoutes.listTimeEntriesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const result = await matterTimeEntriesService.listMatterTimeEntries(
    {
      filters: {
        billable: query.billable,
        startDate: query.start_date,
        endDate: query.end_date,
        entryId: query.entry_id,
      },
    },
    scopedCtx
  );
  return sendResult(c, result);
};

const createTimeEntryHandler: AppRouteHandler<typeof matterRoutes.createTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService.createMatterTimeEntry({ data: validatedBody }, scopedCtx);
  return sendResult(c, result, 201);
};

const updateTimeEntryHandler: AppRouteHandler<typeof matterRoutes.updateTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService.updateMatterTimeEntry(
    { entryId: entry_id, data: validatedBody },
    scopedCtx
  );
  return sendResult(c, result);
};

const deleteTimeEntryHandler: AppRouteHandler<typeof matterRoutes.deleteTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterTimeEntriesService.deleteMatterTimeEntry({ entryId: entry_id }, scopedCtx);
  return sendResult(c, result);
};

const getTimeEntryStatsHandler: AppRouteHandler<typeof matterRoutes.getTimeEntryStatsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterTimeEntriesService.getTimeEntryStats(scopedCtx);
  return sendResult(c, result);
};

const listExpensesHandler: AppRouteHandler<typeof matterRoutes.listExpensesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const result = await matterExpensesService.listMatterExpenses(
    {
      filters: {
        billable: query.billable,
        startDate: query.start_date,
        endDate: query.end_date,
        expenseId: query.expense_id,
      },
    },
    scopedCtx
  );
  return sendResult(c, result);
};

const createExpenseHandler: AppRouteHandler<typeof matterRoutes.createExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService.createMatterExpense({ data: validatedBody }, scopedCtx);
  return sendResult(c, result, 201);
};

const updateExpenseHandler: AppRouteHandler<typeof matterRoutes.updateExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService.updateMatterExpense(
    { expenseId: expense_id, data: validatedBody },
    scopedCtx
  );
  return sendResult(c, result);
};

const deleteExpenseHandler: AppRouteHandler<typeof matterRoutes.deleteExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterExpensesService.deleteMatterExpense({ expenseId: expense_id }, scopedCtx);
  return sendResult(c, result);
};

const listMilestonesHandler: AppRouteHandler<typeof matterRoutes.listMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const result = await matterMilestonesService.listMatterMilestones(
    { filters: { milestoneId: query.milestone_id } },
    scopedCtx
  );
  return sendResult(c, result);
};

const createMilestoneHandler: AppRouteHandler<typeof matterRoutes.createMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService.createMatterMilestone(
    {
      data: {
        ...validatedBody,
        order: validatedBody.order ?? 0,
      },
    },
    scopedCtx
  );
  return sendResult(c, result, 201);
};

const updateMilestoneHandler: AppRouteHandler<typeof matterRoutes.updateMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService.updateMatterMilestone(
    { milestoneId: milestone_id, data: validatedBody },
    scopedCtx
  );
  return sendResult(c, result);
};

const deleteMilestoneHandler: AppRouteHandler<typeof matterRoutes.deleteMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterMilestonesService.deleteMatterMilestone({ milestoneId: milestone_id }, scopedCtx);
  return sendResult(c, result);
};

const reorderMilestonesHandler: AppRouteHandler<typeof matterRoutes.reorderMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService.reorderMilestones({ data: validatedBody }, scopedCtx);
  return sendResult(c, result);
};

const listMatterTasksHandler: AppRouteHandler<typeof matterRoutes.listMatterTasksRoute> = async (c) =>
  c.json({ error: 'Matter tasks are not yet implemented' }, 501);
const getMatterUnbilledHandler: AppRouteHandler<typeof matterRoutes.getMatterUnbilledRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };

  const result = await mattersService.getMatterUnbilled(matterId, scopedCtx);

  return sendResult(c, result);
};

export const handlers = {
  listMattersHandler,
  getMatterHandler,
  createMatterHandler,
  updateMatterHandler,
  deleteMatterHandler,
  listTimeEntriesHandler,
  createTimeEntryHandler,
  updateTimeEntryHandler,
  deleteTimeEntryHandler,
  getMatterActivityHandler,
  getTimeEntryStatsHandler,
  listExpensesHandler,
  createExpenseHandler,
  updateExpenseHandler,
  deleteExpenseHandler,
  listMilestonesHandler,
  createMilestoneHandler,
  updateMilestoneHandler,
  deleteMilestoneHandler,
  reorderMilestonesHandler,
  listMatterNotesHandler,
  createMatterNoteHandler,
  updateMatterNoteHandler,
  deleteMatterNoteHandler,
  listMatterTasksHandler,
  getMatterUnbilledHandler,
};
