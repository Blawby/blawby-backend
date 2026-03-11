import { routes as matterRoutes } from '@/modules/matters/routes';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { matterExpensesService } from '@/modules/matters/services/matter-expenses.service';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

const createMatterHandler: AppRouteHandler<typeof matterRoutes.createMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');

  const result = await mattersService.createMatter(validatedBody, ctx);

  return response.fromResult(c, result);
};

const getMattersHandler: AppRouteHandler<typeof matterRoutes.getMattersRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');

  if (query.matter_id) {
    const result = await mattersService.getMatterById(query.matter_id, ctx);
    if (!result.success) return response.fromResult(c, result);
    return response.ok(c, { matter: result.data });
  }

  const page = parseInt(String(query.page ?? '1'), 10);
  const limit = parseInt(String(query.limit ?? '20'), 10);
  const result = await mattersService.listMatters({ ...query, page, limit }, ctx);

  if (!result.success) return response.fromResult(c, result);

  return response.ok(c, {
    matters: result.data.matters,
    total: result.data.total,
    page,
    limit,
    totalPages: Math.ceil(result.data.total / limit),
  });
};

const updateMatterHandler: AppRouteHandler<typeof matterRoutes.updateMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await mattersService.updateMatter(id, validatedBody, ctx);

  return response.fromResult(c, result);
};

const deleteMatterHandler: AppRouteHandler<typeof matterRoutes.deleteMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id } = c.req.valid('param');
  const result = await mattersService.deleteMatter(id, ctx);
  return response.fromResult(c, result);
};

// Matter resource handlers


const getMatterActivityHandler: AppRouteHandler<typeof matterRoutes.getMatterActivityRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');

  const activityResult = await matterActivityService.getMatterActivity({
    limit: query.limit,
    offset: query.offset,
    activityId: query.activity_id,
  }, scopedCtx);

  if (!activityResult.success) {
    return response.fromResult(c, activityResult);
  }

  return c.json({ activities: activityResult.data }, 200);
};

const listMatterNotesHandler: AppRouteHandler<typeof matterRoutes.listMatterNotesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const result = await matterNotesService.listMatterNotes(
    { filters: { noteId: query.note_id } }, scopedCtx,
  );
  return response.fromResult(c, result);
};

const createMatterNoteHandler: AppRouteHandler<typeof matterRoutes.createMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterNotesService.createMatterNote({ data: validatedBody }, scopedCtx);
  return response.fromResult(c, result, 201);
};

const updateMatterNoteHandler: AppRouteHandler<typeof matterRoutes.updateMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterNotesService.updateMatterNote(
    { noteId: note_id, data: validatedBody },
    scopedCtx,
  );
  return response.fromResult(c, result);
};

const deleteMatterNoteHandler: AppRouteHandler<typeof matterRoutes.deleteMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterNotesService.deleteMatterNote({ noteId: note_id }, scopedCtx);
  return response.fromResult(c, result);
};

const listTimeEntriesHandler: AppRouteHandler<typeof matterRoutes.listTimeEntriesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const result = await matterTimeEntriesService.listMatterTimeEntries({
    filters: {
      billable: query.billable,
      startDate: query.start_date,
      endDate: query.end_date,
      entryId: query.entry_id,
    },
  }, scopedCtx);
  return response.fromResult(c, result);
};

const createTimeEntryHandler: AppRouteHandler<typeof matterRoutes.createTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService
    .createMatterTimeEntry({ data: validatedBody }, scopedCtx);
  return response.fromResult(c, result, 201);
};

const updateTimeEntryHandler: AppRouteHandler<typeof matterRoutes.updateTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService.updateMatterTimeEntry(
    { entryId: entry_id, data: validatedBody },
    scopedCtx,
  );
  return response.fromResult(c, result);
};

const deleteTimeEntryHandler: AppRouteHandler<typeof matterRoutes.deleteTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterTimeEntriesService.deleteMatterTimeEntry(
    { entryId: entry_id },
    scopedCtx,
  );
  return response.fromResult(c, result);
};

const getTimeEntryStatsHandler: AppRouteHandler<typeof matterRoutes.getTimeEntryStatsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterTimeEntriesService.getTimeEntryStats(scopedCtx);
  return response.fromResult(c, result);
};

const listExpensesHandler: AppRouteHandler<typeof matterRoutes.listExpensesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const result = await matterExpensesService.listMatterExpenses({
    filters: {
      billable: query.billable,
      startDate: query.start_date,
      endDate: query.end_date,
      expenseId: query.expense_id,
    },
  }, scopedCtx);
  return response.fromResult(c, result);
};

const createExpenseHandler: AppRouteHandler<typeof matterRoutes.createExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService
    .createMatterExpense({ data: validatedBody }, scopedCtx);
  return response.fromResult(c, result, 201);
};

const updateExpenseHandler: AppRouteHandler<typeof matterRoutes.updateExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService.updateMatterExpense(
    { expenseId: expense_id, data: validatedBody },
    scopedCtx,
  );
  return response.fromResult(c, result);
};

const deleteExpenseHandler: AppRouteHandler<typeof matterRoutes.deleteExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterExpensesService.deleteMatterExpense(
    { expenseId: expense_id },
    scopedCtx,
  );
  return response.fromResult(c, result);
};

const listMilestonesHandler: AppRouteHandler<typeof matterRoutes.listMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const result = await matterMilestonesService.listMatterMilestones(
    { filters: { milestoneId: query.milestone_id } },
    scopedCtx,
  );
  return response.fromResult(c, result);
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
    scopedCtx,
  );
  return response.fromResult(c, result, 201);
};

const updateMilestoneHandler: AppRouteHandler<typeof matterRoutes.updateMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService.updateMatterMilestone(
    { milestoneId: milestone_id, data: validatedBody },
    scopedCtx,
  );
  return response.fromResult(c, result);
};

const deleteMilestoneHandler: AppRouteHandler<typeof matterRoutes.deleteMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const result = await matterMilestonesService.deleteMatterMilestone(
    { milestoneId: milestone_id },
    scopedCtx,
  );
  return response.fromResult(c, result);
};

const reorderMilestonesHandler: AppRouteHandler<typeof matterRoutes.reorderMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService
    .reorderMilestones({ data: validatedBody }, scopedCtx);
  return response.fromResult(c, result);
};


const listMatterTasksHandler: AppRouteHandler<typeof matterRoutes.listMatterTasksRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { id: matterId } = c.req.valid('param');
  const accessResult = await mattersService.verifyMatterAccess(matterId, ctx);
  if (!accessResult.success) return response.fromResult(c, accessResult);
  return c.json({ error: 'Matter tasks are not yet implemented' }, 501);
};

export const handlers = {
  getMattersHandler,
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
};
