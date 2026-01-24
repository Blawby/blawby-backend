import { OpenAPIHono } from '@hono/zod-openapi';
import * as routes from '@/modules/matters/routes';
import * as handlers from '@/modules/matters/handlers';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';
import type { AppContext } from '@/shared/types/hono';

import { createHonoApp } from '@/shared/router/factory';

const mattersApp = createHonoApp();

// ==================== PRACTICE AREAS ====================
mattersApp.openapi(routes.listPracticeAreasRoute, handlers.listPracticeAreasHandler);
mattersApp.openapi(routes.createPracticeAreaRoute, handlers.createPracticeAreaHandler);

// ==================== MATTERS ====================
mattersApp.openapi(routes.createMatterRoute, handlers.createMatterHandler);
mattersApp.openapi(routes.getMatterRoute, handlers.getMatterHandler);
mattersApp.openapi(routes.updateMatterRoute, handlers.updateMatterHandler);
mattersApp.openapi(routes.deleteMatterRoute, handlers.deleteMatterHandler);
mattersApp.openapi(routes.getMatterActivityRoute, handlers.getMatterActivityHandler);

// ==================== MATTER NOTES ====================
mattersApp.openapi(routes.listMatterNotesRoute, handlers.listMatterNotesHandler);
mattersApp.openapi(routes.createMatterNoteRoute, handlers.createMatterNoteHandler);

// ==================== MATTER TIME ENTRIES ====================
mattersApp.openapi(routes.listTimeEntriesRoute, handlers.listTimeEntriesHandler);
mattersApp.openapi(routes.createTimeEntryRoute, handlers.createTimeEntryHandler);
mattersApp.openapi(routes.getTimeEntryStatsRoute, handlers.getTimeEntryStatsHandler);

// ==================== MATTER EXPENSES ====================
mattersApp.openapi(routes.listExpensesRoute, handlers.listExpensesHandler);
mattersApp.openapi(routes.createExpenseRoute, handlers.createExpenseHandler);

// ==================== MATTER MILESTONES ====================
mattersApp.openapi(routes.listMilestonesRoute, handlers.listMilestonesHandler);
mattersApp.openapi(routes.createMilestoneRoute, handlers.createMilestoneHandler);
mattersApp.openapi(routes.reorderMilestonesRoute, handlers.reorderMilestonesHandler);

registerOpenApiRoutes(mattersApp, routes);

export default mattersApp;
