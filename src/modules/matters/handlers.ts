import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import * as practiceAreasService from '@/modules/matters/services/practice-areas.service';
import * as mattersService from '@/modules/matters/services/matters.service';
import * as notesService from '@/modules/matters/services/matter-notes.service';
import * as timeEntriesService from '@/modules/matters/services/matter-time-entries.service';
import * as expensesService from '@/modules/matters/services/matter-expenses.service';
import * as milestonesService from '@/modules/matters/services/matter-milestones.service';
import { getMatterActivity } from '@/modules/matters/services/matter-activity.service';
import {
  listPracticeAreasRoute,
  createPracticeAreaRoute,
  listMattersRoute,
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

export const listPracticeAreasHandler: AppRouteHandler<typeof listPracticeAreasRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId } = c.req.valid('param');
  const practiceAreas = await practiceAreasService.listPracticeAreas(organizationId, user, c.req.header());
  return response.ok(c, { practiceAreas });
};

export const createPracticeAreaHandler: AppRouteHandler<typeof createPracticeAreaRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const practiceArea = await practiceAreasService.createPracticeArea(organizationId, validatedBody, user, c.req.header());
  return response.created(c, { practiceArea });
};

export const listMattersHandler: AppRouteHandler<typeof listMattersRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId } = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await mattersService.listMatters(organizationId, {
    ...query,
    page: parseInt(String(query.page || '1'), 10),
    limit: parseInt(String(query.limit || '20'), 10),
  }, user, c.req.header());
  return response.ok(c, {
    matters: result.matters,
    total: result.total,
    page: parseInt(String(query.page || '1'), 10),
    limit: parseInt(String(query.limit || '20'), 10),
    totalPages: Math.ceil(result.total / parseInt(String(query.limit || '20'), 10)),
  });
};

export const createMatterHandler: AppRouteHandler<typeof createMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');

  const matter = await mattersService.createMatter(
    organizationId,
    validatedBody,
    user,
    c.req.header(),
  );
  return response.created(c, matter);
};

export const getMatterHandler: AppRouteHandler<typeof getMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const matter = await mattersService.getMatterById(organizationId, uuid, user, c.req.header());
  return response.ok(c, matter);
};

export const updateMatterHandler: AppRouteHandler<typeof updateMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const matter = await mattersService.updateMatter(organizationId, uuid, validatedBody, user, c.req.header());
  return response.ok(c, matter);
};

export const deleteMatterHandler: AppRouteHandler<typeof deleteMatterRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  await mattersService.deleteMatter(organizationId, uuid, user, c.req.header());
  return response.ok(c, { success: true });
};

export const getMatterActivityHandler: AppRouteHandler<typeof getMatterActivityRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  await mattersService.getMatterById(organizationId, uuid, user, c.req.header());
  const assets = await getMatterActivity(uuid);
  return response.ok(c, { activity: assets });
};

export const listMatterNotesHandler: AppRouteHandler<typeof listMatterNotesRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const notes = await notesService.listMatterNotes(organizationId, uuid, user, c.req.header());
  return response.ok(c, notes);
};

export const createMatterNoteHandler: AppRouteHandler<typeof createMatterNoteRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const note = await notesService.createMatterNote(organizationId, uuid, validatedBody, user, c.req.header());
  return response.created(c, note);
};

export const listTimeEntriesHandler: AppRouteHandler<typeof listTimeEntriesRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const timeEntries = await timeEntriesService.listMatterTimeEntries(organizationId, uuid, user, c.req.header());
  return response.ok(c, timeEntries);
};

export const createTimeEntryHandler: AppRouteHandler<typeof createTimeEntryRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const timeEntry = await timeEntriesService.createMatterTimeEntry(organizationId, uuid, validatedBody, user, c.req.header());
  return response.created(c, timeEntry);
};

export const getTimeEntryStatsHandler: AppRouteHandler<typeof getTimeEntryStatsRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const stats = await timeEntriesService.getTimeEntryStats(organizationId, uuid, user, c.req.header());
  return response.ok(c, stats);
};

export const listExpensesHandler: AppRouteHandler<typeof listExpensesRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const expenses = await expensesService.listMatterExpenses(organizationId, uuid, user, c.req.header());
  return response.ok(c, expenses);
};

export const createExpenseHandler: AppRouteHandler<typeof createExpenseRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const expense = await expensesService.createMatterExpense(organizationId, uuid, validatedBody, user, c.req.header());
  return response.created(c, expense);
};

export const listMilestonesHandler: AppRouteHandler<typeof listMilestonesRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const milestones = await milestonesService.listMatterMilestones(organizationId, uuid, user, c.req.header());
  return response.ok(c, milestones);
};

export const createMilestoneHandler: AppRouteHandler<typeof createMilestoneRoute> = async (c) => {
  const user = c.get('user')!;
  const { organizationId, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const milestone = await milestonesService.createMatterMilestone(
    organizationId,
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
  const { organizationId, uuid } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  await milestonesService.reorderMilestones(organizationId, uuid, validatedBody, user, c.req.header());
  return response.ok(c, { success: true });
};
