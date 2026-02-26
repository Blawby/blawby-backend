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
  listMatterTasksRoute,
  createMatterTaskRoute,
  updateMatterTaskRoute,
  deleteMatterTaskRoute,
  generateMatterTasksRoute,
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
import { matterTasksService } from '@/modules/matters/services/matter-tasks.service';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { AppRouteHandler } from '@/shared/types/hono';
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
  const query = c.req.valid('query');

  const activityResult = await matterActivityService.getMatterActivity(practice_id, id, user, c.req.header(), {
    limit: query.limit,
    offset: query.offset,
    activityId: query.activity_id,
  });

  if (!activityResult.success) {
    return response.fromResult(c, activityResult);
  }

  return c.json({ activities: activityResult.data }, 200);
};

export const listMatterNotesHandler: AppRouteHandler<typeof listMatterNotesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await matterNotesService.listMatterNotes(
    practice_id, id, user, c.req.header(), { noteId: query.note_id },
  );
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
  const { practice_id, id, note_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterNotesService.updateMatterNote(
    practice_id,
    id,
    note_id,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteMatterNoteHandler: AppRouteHandler<typeof deleteMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, note_id } = c.req.valid('param');
  const result = await matterNotesService.deleteMatterNote(practice_id, id, note_id, user, c.req.header());
  return response.fromResult(c, result);
};

export const listMatterTasksHandler: AppRouteHandler<typeof listMatterTasksRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await matterTasksService.listMatterTasks(practice_id, id, user, c.req.header(), {
    taskId: query.task_id,
    assigneeId: query.assignee_id,
    status: query.status,
    priority: query.priority,
    stage: query.stage,
  });

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { tasks: result.data });
};

export const createMatterTaskHandler: AppRouteHandler<typeof createMatterTaskRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTasksService.createMatterTask(practice_id, id, validatedBody, user, c.req.header());

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { task: result.data });
};

export const updateMatterTaskHandler: AppRouteHandler<typeof updateMatterTaskRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, task_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTasksService.updateMatterTask(
    practice_id,
    id,
    task_id,
    validatedBody,
    user,
    c.req.header(),
  );

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { task: result.data });
};

export const deleteMatterTaskHandler: AppRouteHandler<typeof deleteMatterTaskRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, task_id } = c.req.valid('param');
  const result = await matterTasksService.deleteMatterTask(practice_id, id, task_id, user, c.req.header());
  return response.fromResult(c, result);
};

export const generateMatterTasksHandler: AppRouteHandler<typeof generateMatterTasksRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTasksService.generateMatterTasksFromTemplate(
    practice_id,
    id,
    validatedBody,
    user,
    c.req.header(),
  );

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { tasks: result.data });
};

export const listTimeEntriesHandler: AppRouteHandler<typeof listTimeEntriesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await matterTimeEntriesService.listMatterTimeEntries(practice_id, id, user, c.req.header(), {
    billable: query.billable,
    startDate: query.start_date,
    endDate: query.end_date,
    entryId: query.entry_id,
  });
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
  const { practice_id, id, entry_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterTimeEntriesService.updateMatterTimeEntry(
    practice_id,
    id,
    entry_id,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteTimeEntryHandler: AppRouteHandler<typeof deleteTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, entry_id } = c.req.valid('param');
  const result = await matterTimeEntriesService.deleteMatterTimeEntry(
    practice_id,
    id,
    entry_id,
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
  const query = c.req.valid('query');
  const result = await matterExpensesService.listMatterExpenses(practice_id, id, user, c.req.header(), {
    billable: query.billable,
    startDate: query.start_date,
    endDate: query.end_date,
    expenseId: query.expense_id,
  });
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
  const { practice_id, id, expense_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterExpensesService.updateMatterExpense(
    practice_id,
    id,
    expense_id,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteExpenseHandler: AppRouteHandler<typeof deleteExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, expense_id } = c.req.valid('param');
  const result = await matterExpensesService.deleteMatterExpense(
    practice_id,
    id,
    expense_id,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const listMilestonesHandler: AppRouteHandler<typeof listMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await matterMilestonesService.listMatterMilestones(
    practice_id,
    id,
    user,
    c.req.header(),
    { milestoneId: query.milestone_id },
  );
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
  const { practice_id, id, milestone_id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const result = await matterMilestonesService.updateMatterMilestone(
    practice_id,
    id,
    milestone_id,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.fromResult(c, result);
};

export const deleteMilestoneHandler: AppRouteHandler<typeof deleteMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id, milestone_id } = c.req.valid('param');
  const result = await matterMilestonesService.deleteMatterMilestone(
    practice_id,
    id,
    milestone_id,
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
