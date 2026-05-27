import type { routes as matterRoutes } from '@/modules/matters/routes';
import { matterDeadlinesService } from '@/modules/matters/services/matter-deadlines.service';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { matterExpensesService } from '@/modules/matters/services/matter-expenses.service';
import { matterMilestonesService } from '@/modules/matters/services/matter-milestones.service';
import { matterNotesService } from '@/modules/matters/services/matter-notes.service';
import { matterTasksService } from '@/modules/matters/services/matter-tasks.service';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { matterFilesService } from '@/modules/matters/services/matter-files.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterTaskListFilters, OrgTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import type { AppRouteHandler } from '@/shared/types/hono';
import { createServiceContext, getServiceContext } from '@/shared/types/service-context';

const createMatterHandler: AppRouteHandler<typeof matterRoutes.createMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');
  const matter = await mattersService.createMatter(validatedBody, ctx);
  return c.json(matter, 201);
};

const listMattersHandler: AppRouteHandler<typeof matterRoutes.listMattersRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const data = await mattersService.listMatters(
    {
      status: query.status,
      practiceServiceId: query.practice_service_id,
      clientId: query.client_id,
      assigneeId: query.assignee_id,
      responsibleAttorneyId: query.responsible_attorney_id,
      originatingAttorneyId: query.originating_attorney_id,
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
    ctx
  );
  return c.json(
    {
      matters: data.matters,
      total: data.total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(data.total / query.limit),
    },
    200
  );
};

const getMatterHandler: AppRouteHandler<typeof matterRoutes.getMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  const matter = await mattersService.getMatterById(id, ctx);
  return c.json({ matter }, 200);
};

const updateMatterHandler: AppRouteHandler<typeof matterRoutes.updateMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const matter = await mattersService.updateMatter(id, validatedBody, ctx);
  return c.json(matter, 200);
};

const deleteMatterHandler: AppRouteHandler<typeof matterRoutes.deleteMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  await mattersService.deleteMatter(id, ctx);
  return c.body(null, 204);
};

// Matter resource handlers

const getMatterActivityHandler: AppRouteHandler<typeof matterRoutes.getMatterActivityRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const activities = await matterActivityService.getMatterActivity(
    { limit: query.limit, offset: query.offset, activityId: query.activity_id },
    scopedCtx
  );
  return c.json({ activities }, 200);
};

const listMatterNotesHandler: AppRouteHandler<typeof matterRoutes.listMatterNotesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const notes = await matterNotesService.listMatterNotes({ filters: { noteId: query.note_id } }, scopedCtx);
  return c.json(notes, 200);
};

const createMatterNoteHandler: AppRouteHandler<typeof matterRoutes.createMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const note = await matterNotesService.createMatterNote({ data: validatedBody }, scopedCtx);
  return c.json(note, 201);
};

const updateMatterNoteHandler: AppRouteHandler<typeof matterRoutes.updateMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const note = await matterNotesService.updateMatterNote({ noteId: note_id, data: validatedBody }, scopedCtx);
  return c.json(note, 200);
};

const deleteMatterNoteHandler: AppRouteHandler<typeof matterRoutes.deleteMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterNotesService.deleteMatterNote({ noteId: note_id }, scopedCtx);
  return c.body(null, 204);
};

const listTimeEntriesHandler: AppRouteHandler<typeof matterRoutes.listTimeEntriesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const entries = await matterTimeEntriesService.listMatterTimeEntries(
    {
      filters: {
        billable: query.billable,
        invoiced: query.invoiced,
        startDate: query.start_date,
        endDate: query.end_date,
        entryId: query.entry_id,
      },
    },
    scopedCtx
  );
  return c.json(entries, 200);
};

const createTimeEntryHandler: AppRouteHandler<typeof matterRoutes.createTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const entry = await matterTimeEntriesService.createMatterTimeEntry({ data: validatedBody }, scopedCtx);
  return c.json(entry, 201);
};

const updateTimeEntryHandler: AppRouteHandler<typeof matterRoutes.updateTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const entry = await matterTimeEntriesService.updateMatterTimeEntry(
    { entryId: entry_id, data: validatedBody },
    scopedCtx
  );
  return c.json(entry, 200);
};

const deleteTimeEntryHandler: AppRouteHandler<typeof matterRoutes.deleteTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterTimeEntriesService.deleteMatterTimeEntry({ entryId: entry_id }, scopedCtx);
  return c.body(null, 204);
};

const getTimeEntryStatsHandler: AppRouteHandler<typeof matterRoutes.getTimeEntryStatsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const stats = await matterTimeEntriesService.getTimeEntryStats(scopedCtx);
  return c.json(stats, 200);
};

const listExpensesHandler: AppRouteHandler<typeof matterRoutes.listExpensesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const expenses = await matterExpensesService.listMatterExpenses(
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
  return c.json(expenses, 200);
};

const createExpenseHandler: AppRouteHandler<typeof matterRoutes.createExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const expense = await matterExpensesService.createMatterExpense({ data: validatedBody }, scopedCtx);
  return c.json(expense, 201);
};

const updateExpenseHandler: AppRouteHandler<typeof matterRoutes.updateExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const expense = await matterExpensesService.updateMatterExpense(
    { expenseId: expense_id, data: validatedBody },
    scopedCtx
  );
  return c.json(expense, 200);
};

const deleteExpenseHandler: AppRouteHandler<typeof matterRoutes.deleteExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterExpensesService.deleteMatterExpense({ expenseId: expense_id }, scopedCtx);
  return c.body(null, 204);
};

const listMilestonesHandler: AppRouteHandler<typeof matterRoutes.listMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const milestones = await matterMilestonesService.listMatterMilestones(
    { filters: { milestoneId: query.milestone_id } },
    scopedCtx
  );
  return c.json(milestones, 200);
};

const createMilestoneHandler: AppRouteHandler<typeof matterRoutes.createMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const milestone = await matterMilestonesService.createMatterMilestone(
    {
      data: {
        ...validatedBody,
        order: validatedBody.order ?? 0,
      },
    },
    scopedCtx
  );
  return c.json(milestone, 201);
};

const updateMilestoneHandler: AppRouteHandler<typeof matterRoutes.updateMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const milestone = await matterMilestonesService.updateMatterMilestone(
    { milestoneId: milestone_id, data: validatedBody },
    scopedCtx
  );
  return c.json(milestone, 200);
};

const deleteMilestoneHandler: AppRouteHandler<typeof matterRoutes.deleteMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterMilestonesService.deleteMatterMilestone({ milestoneId: milestone_id }, scopedCtx);
  return c.body(null, 204);
};

const reorderMilestonesHandler: AppRouteHandler<typeof matterRoutes.reorderMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  await matterMilestonesService.reorderMilestones({ data: validatedBody }, scopedCtx);
  return c.body(null, 204);
};

const listMatterTasksHandler: AppRouteHandler<typeof matterRoutes.listMatterTasksRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const query = c.req.valid('query');
  const filters: MatterTaskListFilters = {
    taskId: query.task_id,
    assigneeId: query.assignee_id,
    status: query.status,
    priority: query.priority,
    stage: query.stage,
  };
  const tasks = await matterTasksService.listMatterTasks({ matterId, filters }, ctx);
  return c.json({ tasks }, 200);
};

const createMatterTaskHandler: AppRouteHandler<typeof matterRoutes.createMatterTaskRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const task = await matterTasksService.createMatterTask({ matterId, data: validatedBody }, ctx);
  return c.json(task, 201);
};

const updateMatterTaskHandler: AppRouteHandler<typeof matterRoutes.updateMatterTaskRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, task_id: taskId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const task = await matterTasksService.updateMatterTask({ matterId, taskId, data: validatedBody }, ctx);
  return c.json(task, 200);
};

const deleteMatterTaskHandler: AppRouteHandler<typeof matterRoutes.deleteMatterTaskRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, task_id: taskId } = c.req.valid('param');
  await matterTasksService.deleteMatterTask({ matterId, taskId }, ctx);
  return c.body(null, 204);
};

const getMatterUnbilledHandler: AppRouteHandler<typeof matterRoutes.getMatterUnbilledRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const unbilled = await mattersService.getMatterUnbilled(matterId, scopedCtx);
  return c.json(unbilled, 200);
};

const linkMatterFileHandler: AppRouteHandler<typeof matterRoutes.linkMatterFileRoute> = async (c) => {
  const { db, ...baseCtx } = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const { upload_id: uploadId } = c.req.valid('json');

  const prep = await matterFilesService.prepareLinkUpload({ matterId, uploadId }, createServiceContext(baseCtx, db));
  const linked = await db.transaction((tx) =>
    matterFilesService.persistLinkUpload({ matterId, uploadId, prep }, createServiceContext(baseCtx, tx))
  );
  return c.json(linked, 201);
};

const listMatterFilesHandler: AppRouteHandler<typeof matterRoutes.listMatterFilesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const files = await matterFilesService.listMatterFiles({ matterId }, ctx);
  return c.json(files, 200);
};

const unlinkMatterFileHandler: AppRouteHandler<typeof matterRoutes.unlinkMatterFileRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, upload_id: uploadId } = c.req.valid('param');
  await matterFilesService.unlinkUpload({ matterId, uploadId }, ctx);
  return c.body(null, 204);
};

const getMattersSummaryByOriginatingAttorneyHandler: AppRouteHandler<
  typeof matterRoutes.getMattersSummaryByOriginatingAttorneyRoute
> = async (c) => {
  const ctx = getServiceContext(c);
  const summary = await mattersService.getMattersSummaryByOriginatingAttorney({}, ctx);
  return c.json(summary, 200);
};

const listOrganizationTasksHandler: AppRouteHandler<typeof matterRoutes.listOrganizationTasksRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const filters: OrgTaskListFilters = {
    assigneeId: query.assignee_id,
    status: query.status,
    dueBefore: query.due_before,
    page: query.page,
    limit: query.limit,
  };
  const result = await matterTasksService.listOrganizationTasks({ filters }, ctx);
  return c.json(result, 200);
};

const listDeadlinesHandler: AppRouteHandler<typeof matterRoutes.listDeadlinesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const deadlines = await matterDeadlinesService.listDeadlines({}, ctx);
  return c.json(deadlines, 200);
};

const createDeadlineHandler: AppRouteHandler<typeof matterRoutes.createDeadlineRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const body = c.req.valid('json');
  const deadline = await matterDeadlinesService.createDeadline({ data: body }, ctx);
  return c.json(deadline, 201);
};

const updateDeadlineHandler: AppRouteHandler<typeof matterRoutes.updateDeadlineRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { deadline_id } = c.req.valid('param');
  const body = c.req.valid('json');
  const deadline = await matterDeadlinesService.updateDeadline({ deadlineId: deadline_id, data: body }, ctx);
  return c.json(deadline, 200);
};

const deleteDeadlineHandler: AppRouteHandler<typeof matterRoutes.deleteDeadlineRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { deadline_id } = c.req.valid('param');
  await matterDeadlinesService.deleteDeadline({ deadlineId: deadline_id }, ctx);
  return c.body(null, 204);
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
  createMatterTaskHandler,
  updateMatterTaskHandler,
  deleteMatterTaskHandler,
  listOrganizationTasksHandler,
  getMattersSummaryByOriginatingAttorneyHandler,
  getMatterUnbilledHandler,
  linkMatterFileHandler,
  listMatterFilesHandler,
  unlinkMatterFileHandler,
  listDeadlinesHandler,
  createDeadlineHandler,
  updateDeadlineHandler,
  deleteDeadlineHandler,
};
