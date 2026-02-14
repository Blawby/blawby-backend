import * as handlers from '@/modules/matters/handlers';
import * as routes from '@/modules/matters/routes';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const mattersApp = createHonoApp();

// ==================== MATTERS ====================
mattersApp.openapi(routes.createMatterRoute, handlers.createMatterHandler);
mattersApp.openapi(routes.getMattersRoute, handlers.getMattersHandler);
mattersApp.openapi(routes.updateMatterRoute, handlers.updateMatterHandler);
mattersApp.openapi(routes.deleteMatterRoute, handlers.deleteMatterHandler);
mattersApp.openapi(routes.getMatterActivityRoute, handlers.getMatterActivityHandler);

// ==================== MATTER NOTES ====================
mattersApp.openapi(routes.listMatterNotesRoute, handlers.listMatterNotesHandler);
mattersApp.openapi(routes.createMatterNoteRoute, handlers.createMatterNoteHandler);
mattersApp.openapi(routes.updateMatterNoteRoute, handlers.updateMatterNoteHandler);
mattersApp.openapi(routes.deleteMatterNoteRoute, handlers.deleteMatterNoteHandler);

// ==================== MATTER TIME ENTRIES ====================
mattersApp.openapi(routes.listTimeEntriesRoute, handlers.listTimeEntriesHandler);
mattersApp.openapi(routes.createTimeEntryRoute, handlers.createTimeEntryHandler);
mattersApp.openapi(routes.updateTimeEntryRoute, handlers.updateTimeEntryHandler);
mattersApp.openapi(routes.deleteTimeEntryRoute, handlers.deleteTimeEntryHandler);
mattersApp.openapi(routes.getTimeEntryStatsRoute, handlers.getTimeEntryStatsHandler);

// ==================== MATTER EXPENSES ====================
mattersApp.openapi(routes.listExpensesRoute, handlers.listExpensesHandler);
mattersApp.openapi(routes.createExpenseRoute, handlers.createExpenseHandler);
mattersApp.openapi(routes.updateExpenseRoute, handlers.updateExpenseHandler);
mattersApp.openapi(routes.deleteExpenseRoute, handlers.deleteExpenseHandler);

// ==================== MATTER MILESTONES ====================
mattersApp.openapi(routes.listMilestonesRoute, handlers.listMilestonesHandler);
mattersApp.openapi(routes.createMilestoneRoute, handlers.createMilestoneHandler);
mattersApp.openapi(routes.updateMilestoneRoute, handlers.updateMilestoneHandler);
mattersApp.openapi(routes.deleteMilestoneRoute, handlers.deleteMilestoneHandler);
mattersApp.openapi(routes.reorderMilestonesRoute, handlers.reorderMilestonesHandler);

registerOpenApiRoutes(mattersApp, routes);

export default mattersApp;
