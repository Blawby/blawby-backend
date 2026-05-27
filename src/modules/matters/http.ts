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

// Org-scoped sub-resources — MUST be registered BEFORE the `/:practice_id` sub-router
// so Hono's matcher prefers these literal paths over the wildcard `/:practice_id/:id/*`
// that requireMatterAccess() guards (which would reject literals like "tasks" / "summary"
// as invalid matter UUIDs).
app.openapi(
  matterRoutes.getMattersSummaryByOriginatingAttorneyRoute,
  matterHandlers.getMattersSummaryByOriginatingAttorneyHandler
);
app.openapi(matterRoutes.listOrganizationTasksRoute, matterHandlers.listOrganizationTasksHandler);

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
matterSubResources.openapi(matterRoutes.createMatterTaskRoute, matterHandlers.createMatterTaskHandler);
matterSubResources.openapi(matterRoutes.updateMatterTaskRoute, matterHandlers.updateMatterTaskHandler);
matterSubResources.openapi(matterRoutes.deleteMatterTaskRoute, matterHandlers.deleteMatterTaskHandler);

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

// Files
matterSubResources.openapi(matterRoutes.linkMatterFileRoute, matterHandlers.linkMatterFileHandler);
matterSubResources.openapi(matterRoutes.listMatterFilesRoute, matterHandlers.listMatterFilesHandler);
matterSubResources.openapi(matterRoutes.unlinkMatterFileRoute, matterHandlers.unlinkMatterFileHandler);

// Deadlines
matterSubResources.openapi(matterRoutes.listDeadlinesRoute, matterHandlers.listDeadlinesHandler);
matterSubResources.openapi(matterRoutes.createDeadlineRoute, matterHandlers.createDeadlineHandler);
matterSubResources.openapi(matterRoutes.updateDeadlineRoute, matterHandlers.updateDeadlineHandler);
matterSubResources.openapi(matterRoutes.deleteDeadlineRoute, matterHandlers.deleteDeadlineHandler);

// Mount sub-router with prefix
app.route('/:practice_id', matterSubResources);

export default app;
