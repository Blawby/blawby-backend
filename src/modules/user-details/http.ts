import * as handlers from '@/modules/user-details/handlers';
import * as routes from '@/modules/user-details/routes';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createHonoApp } from '@/shared/router/factory';
import { registerOpenApiRoutes } from '@/shared/router/openapi-docs';

const userDetailsApp = createHonoApp();

userDetailsApp.use('*', injectAbility());

// User Details (Note: No POST/create - clients are created via intake or invitation flows)
userDetailsApp.openapi(routes.listUserDetailsRoute, handlers.listUserDetailsHandler);
userDetailsApp.openapi(routes.getUserDetailRoute, handlers.getUserDetailHandler);
userDetailsApp.openapi(routes.updateUserDetailsRoute, handlers.updateUserDetailsHandler);
userDetailsApp.openapi(routes.deleteUserDetailRoute, handlers.deleteUserDetailHandler);

// Memos
userDetailsApp.openapi(routes.listUserDetailsMemosRoute, handlers.listUserDetailsMemosHandler);
userDetailsApp.openapi(routes.createUserDetailMemoRoute, handlers.createUserDetailMemoHandler);
userDetailsApp.openapi(routes.updateUserDetailsMemoRoute, handlers.updateUserDetailMemoHandler);
userDetailsApp.openapi(routes.deleteUserDetailsMemoRoute, handlers.deleteUserDetailMemoHandler);

// Register routes for OpenAPI documentation extraction
registerOpenApiRoutes(userDetailsApp, routes);

export default userDetailsApp;
