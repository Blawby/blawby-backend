import { getMatterActivityRoute } from './activity.routes';
import {
  createMatterRoute,
  listMattersRoute,
  getMatterRoute,
  updateMatterRoute,
  deleteMatterRoute,
} from '@/modules/matters/routes/core.routes';
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

export const routes = {
  createMatterRoute,
  listMattersRoute,
  getMatterRoute,
  updateMatterRoute,
  deleteMatterRoute,
  getMatterActivityRoute,
  getTimeEntryStatsRoute,
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  deleteTimeEntryRoute,
  listMatterNotesRoute,
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
  createMatterTaskRoute,
  updateMatterTaskRoute,
  deleteMatterTaskRoute,
  getMatterUnbilledRoute,
  linkMatterFileRoute,
  listMatterFilesRoute,
  unlinkMatterFileRoute,
};
