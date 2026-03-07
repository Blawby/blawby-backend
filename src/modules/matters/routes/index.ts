import { getMatterActivityRoute } from './activity.routes';
import {
  createMatterRoute,
  getMattersRoute,
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
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  deleteTimeEntryRoute,
  getTimeEntryStatsRoute,
} from '@/modules/matters/routes/time-entries.routes';

export const routes = {
  createMatterRoute,
  getMattersRoute,
  updateMatterRoute,
  deleteMatterRoute,
  getMatterActivityRoute,
  getTimeEntryStatsRoute,
  listMatterNotesRoute,
  createMatterNoteRoute,
  updateMatterNoteRoute,
  deleteMatterNoteRoute,
  listTimeEntriesRoute,
  createTimeEntryRoute,
  updateTimeEntryRoute,
  deleteTimeEntryRoute,
  listExpensesRoute,
  createExpenseRoute,
  updateExpenseRoute,
  deleteExpenseRoute,
  listMilestonesRoute,
  createMilestoneRoute,
  updateMilestoneRoute,
  deleteMilestoneRoute,
  reorderMilestonesRoute,
};
