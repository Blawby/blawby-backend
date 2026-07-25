import { getMatterActivityCountRoute, getMatterActivityRoute } from './activity.routes';
import {
  createMatterRoute,
  listMattersRoute,
  getMatterRoute,
  updateMatterRoute,
  updateMatterLegacyRoute,
  deleteMatterRoute,
  getMattersSummaryByOriginatingAttorneyRoute,
} from '@/modules/matters/routes/core.routes';
import {
  listExpensesRoute,
  createExpenseRoute,
  updateExpenseRoute,
  updateExpenseLegacyRoute,
  deleteExpenseRoute,
} from '@/modules/matters/routes/expenses.routes';
import {
  listMilestonesRoute,
  createMilestoneRoute,
  updateMilestoneRoute,
  updateMilestoneLegacyRoute,
  deleteMilestoneRoute,
  reorderMilestonesRoute,
} from '@/modules/matters/routes/milestones.routes';
import {
  listMatterNotesRoute,
  createMatterNoteRoute,
  updateMatterNoteRoute,
  updateMatterNoteLegacyRoute,
  deleteMatterNoteRoute,
} from '@/modules/matters/routes/notes.routes';
import {
  listMatterTasksRoute,
  createMatterTaskRoute,
  updateMatterTaskRoute,
  updateMatterTaskLegacyRoute,
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
  updateTimeEntryLegacyRoute,
  deleteTimeEntryRoute,
  getTimeEntryStatsRoute,
} from '@/modules/matters/routes/time-entries.routes';

import { getMatterUnbilledRoute } from '@/modules/matters/routes/unbilled.routes';
import { mattersDeadlinesRoutes } from '@/modules/matters/routes/deadlines.routes';

export const routes = {
  createMatterRoute,
  listMattersRoute,
  getMatterRoute,
  updateMatterRoute,
  updateMatterLegacyRoute,
  deleteMatterRoute,
  getMattersSummaryByOriginatingAttorneyRoute,
  getMatterActivityRoute,
  getMatterActivityCountRoute,
  getTimeEntryStatsRoute,
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  updateTimeEntryLegacyRoute,
  deleteTimeEntryRoute,
  listMatterNotesRoute,
  createMatterNoteRoute,
  updateMatterNoteRoute,
  updateMatterNoteLegacyRoute,
  deleteMatterNoteRoute,
  listExpensesRoute,
  createExpenseRoute,
  updateExpenseRoute,
  updateExpenseLegacyRoute,
  deleteExpenseRoute,
  listMilestonesRoute,
  createMilestoneRoute,
  updateMilestoneRoute,
  updateMilestoneLegacyRoute,
  deleteMilestoneRoute,
  reorderMilestonesRoute,
  listMatterTasksRoute,
  createMatterTaskRoute,
  updateMatterTaskRoute,
  updateMatterTaskLegacyRoute,
  deleteMatterTaskRoute,
  listOrganizationTasksRoute,
  getMatterUnbilledRoute,
  linkMatterFileRoute,
  listMatterFilesRoute,
  unlinkMatterFileRoute,
  ...mattersDeadlinesRoutes,
};
