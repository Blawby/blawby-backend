import { handlers as matterHandlers } from '@/modules/matters/handlers';
import { routes as matterRoutes } from '@/modules/matters/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';

const app = createHonoApp();

// Middleware
app.use('*', injectAbility());

// Matters
app.openapi(matterRoutes.createMatterRoute, matterHandlers.createMatterHandler);
app.openapi(matterRoutes.getMattersRoute, matterHandlers.getMattersHandler);
app.openapi(matterRoutes.updateMatterRoute, matterHandlers.updateMatterHandler);
app.openapi(matterRoutes.deleteMatterRoute, matterHandlers.deleteMatterHandler);
app.openapi(matterRoutes.getMatterActivityRoute, matterHandlers.getMatterActivityHandler);
app.openapi(matterRoutes.listMatterTasksRoute, matterHandlers.listMatterTasksHandler);

// Notes
app.openapi(matterRoutes.listMatterNotesRoute, matterHandlers.listMatterNotesHandler);
app.openapi(matterRoutes.createMatterNoteRoute, matterHandlers.createMatterNoteHandler);
app.openapi(matterRoutes.updateMatterNoteRoute, matterHandlers.updateMatterNoteHandler);
app.openapi(matterRoutes.deleteMatterNoteRoute, matterHandlers.deleteMatterNoteHandler);

// Time Entries
app.openapi(matterRoutes.listTimeEntriesRoute, matterHandlers.listTimeEntriesHandler);
app.openapi(matterRoutes.createTimeEntryRoute, matterHandlers.createTimeEntryHandler);
app.openapi(matterRoutes.updateTimeEntryRoute, matterHandlers.updateTimeEntryHandler);
app.openapi(matterRoutes.deleteTimeEntryRoute, matterHandlers.deleteTimeEntryHandler);
app.openapi(matterRoutes.getTimeEntryStatsRoute, matterHandlers.getTimeEntryStatsHandler);

// Expenses
app.openapi(matterRoutes.listExpensesRoute, matterHandlers.listExpensesHandler);
app.openapi(matterRoutes.createExpenseRoute, matterHandlers.createExpenseHandler);
app.openapi(matterRoutes.updateExpenseRoute, matterHandlers.updateExpenseHandler);
app.openapi(matterRoutes.deleteExpenseRoute, matterHandlers.deleteExpenseHandler);

// Milestones
app.openapi(matterRoutes.listMilestonesRoute, matterHandlers.listMilestonesHandler);
app.openapi(matterRoutes.createMilestoneRoute, matterHandlers.createMilestoneHandler);
app.openapi(matterRoutes.updateMilestoneRoute, matterHandlers.updateMilestoneHandler);
app.openapi(matterRoutes.deleteMilestoneRoute, matterHandlers.deleteMilestoneHandler);
app.openapi(matterRoutes.reorderMilestonesRoute, matterHandlers.reorderMilestonesHandler);

export default app;
