import { OpenAPIHono } from '@hono/zod-openapi';
import { handlers as matterHandlers } from '@/modules/matters/handlers';
import { routes as matterRoutes } from '@/modules/matters/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireMatterAccess } from '@/shared/middleware/requireMatterAccess';
import { createHonoApp } from '@/shared/router/factory';
import type { AppContext } from '@/shared/types/hono';

const app = createHonoApp();

// Middleware
app.use('*', injectAbility());

// Core matter routes (have their own access checks in services)
app.openapi(matterRoutes.createMatterRoute, matterHandlers.createMatterHandler);
app.openapi(matterRoutes.listMattersRoute, matterHandlers.listMattersHandler);
app.openapi(matterRoutes.getMatterRoute, matterHandlers.getMatterHandler);
app.openapi(matterRoutes.updateMatterRoute, matterHandlers.updateMatterHandler);
app.openapi(matterRoutes.deleteMatterRoute, matterHandlers.deleteMatterHandler);

// Sub-router for matter sub-resources
// All routes under this router automatically get matter access verification
const matterSubResources = new OpenAPIHono<AppContext>();

// Apply middleware once - affects all nested routes under /:id/*
matterSubResources.use('/:id/*', requireMatterAccess());

// Activity
matterSubResources.openapi(matterRoutes.getMatterActivityRoute, matterHandlers.getMatterActivityHandler);

// Tasks
matterSubResources.openapi(matterRoutes.listMatterTasksRoute, matterHandlers.listMatterTasksHandler);

// Unbilled
matterSubResources.openapi(matterRoutes.getMatterUnbilledRoute, matterHandlers.getMatterUnbilledHandler);

// Notes
matterSubResources.openapi(matterRoutes.listMatterNotesRoute, matterHandlers.listMatterNotesHandler);
matterSubResources.openapi(matterRoutes.createMatterNoteRoute, matterHandlers.createMatterNoteHandler);
matterSubResources.openapi(matterRoutes.updateMatterNoteRoute, matterHandlers.updateMatterNoteHandler);
matterSubResources.openapi(matterRoutes.deleteMatterNoteRoute, matterHandlers.deleteMatterNoteHandler);

// Time Entries
matterSubResources.openapi(matterRoutes.listTimeEntriesRoute, matterHandlers.listTimeEntriesHandler);
matterSubResources.openapi(matterRoutes.getTimeEntryStatsRoute, matterHandlers.getTimeEntryStatsHandler);
matterSubResources.openapi(matterRoutes.createTimeEntryRoute, matterHandlers.createTimeEntryHandler);
matterSubResources.openapi(matterRoutes.updateTimeEntryRoute, matterHandlers.updateTimeEntryHandler);
matterSubResources.openapi(matterRoutes.deleteTimeEntryRoute, matterHandlers.deleteTimeEntryHandler);

// Expenses
matterSubResources.openapi(matterRoutes.listExpensesRoute, matterHandlers.listExpensesHandler);
matterSubResources.openapi(matterRoutes.createExpenseRoute, matterHandlers.createExpenseHandler);
matterSubResources.openapi(matterRoutes.updateExpenseRoute, matterHandlers.updateExpenseHandler);
matterSubResources.openapi(matterRoutes.deleteExpenseRoute, matterHandlers.deleteExpenseHandler);

// Milestones
matterSubResources.openapi(matterRoutes.listMilestonesRoute, matterHandlers.listMilestonesHandler);
matterSubResources.openapi(matterRoutes.createMilestoneRoute, matterHandlers.createMilestoneHandler);
matterSubResources.openapi(matterRoutes.updateMilestoneRoute, matterHandlers.updateMilestoneHandler);
matterSubResources.openapi(matterRoutes.deleteMilestoneRoute, matterHandlers.deleteMilestoneHandler);
matterSubResources.openapi(matterRoutes.reorderMilestonesRoute, matterHandlers.reorderMilestonesHandler);

// Mount sub-router with prefix
app.route('/{practice_id}', matterSubResources);

export default app;
