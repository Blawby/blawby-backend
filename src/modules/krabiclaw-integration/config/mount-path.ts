/**
 * The facade's mount path, extracted into its own dependency-free module so
 * shared, app-wide infrastructure (the root request logger in `hono-app.ts`,
 * `responseMiddleware`'s dev/staging request logging) can recognize facade
 * requests and sanitize their logged path/URL without importing this
 * module's full `http.ts` (which assembles the whole `OpenAPIHono` app,
 * every route, and every handler at module-load time).
 */
export const KRABICLAW_FACADE_MOUNT_PATH = '/api/integrations/krabiclaw/v1';
