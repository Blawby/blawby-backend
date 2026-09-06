import { KRABICLAW_FACADE_MOUNT_PATH } from '@/modules/krabiclaw-integration/config/mount-path';

/**
 * True for any request path under the KrabiClaw facade's mount path.
 *
 * Shared by `hono-app.ts` (pre-auth rate limiting, root request-logger
 * sanitization) and `responseMiddleware.ts` (dev/staging request-logger
 * sanitization) so both app-wide loggers can recognize facade requests
 * without importing the module's full `http.ts` (see `config/mount-path.ts`
 * for why this constant is kept dependency-free).
 */
export const isKrabiclawFacadeRequest = (path: string): boolean =>
  path === KRABICLAW_FACADE_MOUNT_PATH || path.startsWith(`${KRABICLAW_FACADE_MOUNT_PATH}/`);
