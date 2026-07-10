import { getMatterActivityCountRoute, getMatterActivityRoute } from './activity.routes';
import {
  createMatterRoute,
  listMattersRoute,
  listClientMattersRoute,
  getClientMatterRoute,
  getMatterRoute,
  updateMatterRoute,
  deleteMatterRoute,
  getMattersSummaryByOriginatingAttorneyRoute,
} from '@/modules/matters/routes/core.routes';
import {
  getClientMatterActivityRoute,
  listClientMatterNotesRoute,
  listClientMatterTasksRoute,
} from '@/modules/matters/routes/client.routes';
import {
  listExpensesRoute,
  createExpenseRoute,
  updateExpenseRoute,
  deleteExpenseRoute,
} from '@/modules/matters/routes/expenses.routes';
import {
  listMilestonesRoute,
  createMilestoneRoute,
  updateMilestoneRoute,
  deleteMilestoneRoute,
  reorderMilestonesRoute,
} from '@/modules/matters/routes/milestones.routes';
import {
  listMatterNotesRoute,
  createMatterNoteRoute,
  updateMatterNoteRoute,
  deleteMatterNoteRoute,
} from '@/modules/matters/routes/notes.routes';
import {
  listMatterTasksRoute,
  createMatterTaskRoute,
  updateMatterTaskRoute,
  deleteMatterTaskRoute,
  listOrganizationTasksRoute,
} from '@/modules/matters/routes/tasks.routes';
import {
  linkMatterFileRoute,
  listMatterFilesRoute,
  unlinkMatterFileRoute,
} from '@/modules/matters/routes/matter-files.routes';
import {
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  deleteTimeEntryRoute,
  getTimeEntryStatsRoute,
} from '@/modules/matters/routes/time-entries.routes';

import { getMatterUnbilledRoute } from '@/modules/matters/routes/unbilled.routes';
import { mattersDeadlinesRoutes } from '@/modules/matters/routes/deadlines.routes';

export const routes = {
  createMatterRoute,
  listMattersRoute,
  listClientMattersRoute,
  getClientMatterRoute,
  getMatterRoute,
  updateMatterRoute,
  deleteMatterRoute,
  getMattersSummaryByOriginatingAttorneyRoute,
  getMatterActivityRoute,
  getMatterActivityCountRoute,
  getClientMatterActivityRoute,
  getTimeEntryStatsRoute,
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  deleteTimeEntryRoute,
  listMatterNotesRoute,
  listClientMatterNotesRoute,
  createMatterNoteRoute,
  updateMatterNoteRoute,
  deleteMatterNoteRoute,
  listExpensesRoute,
  createExpenseRoute,
  updateExpenseRoute,
  deleteExpenseRoute,
  listMilestonesRoute,
  createMilestoneRoute,
  updateMilestoneRoute,
  deleteMilestoneRoute,
  reorderMilestonesRoute,
  listMatterTasksRoute,
  listClientMatterTasksRoute,
  createMatterTaskRoute,
  updateMatterTaskRoute,
  deleteMatterTaskRoute,
  listOrganizationTasksRoute,
  getMatterUnbilledRoute,
  linkMatterFileRoute,
  listMatterFilesRoute,
  unlinkMatterFileRoute,
  ...mattersDeadlinesRoutes,
};
