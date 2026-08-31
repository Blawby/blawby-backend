import type { Hook } from '@hono/zod-openapi';

import type { AppContext } from '@/shared/types/hono';

/**
 * `createHonoApp()`'s shared `defaultHook` (`hasValidationErrors`, in
 * `src/shared/router/openapi-hook.ts`) returns `{ success: false, error: {
 * name, message, details: [{ field, message, code }] } }` on a zod
 * validation failure — a different (and more revealing — `details[].field`
 * echoes the raw Zod issue path) body shape than this module's Reviewed
 * Error Contract envelope, and it never reaches `http.ts`'s `onError`
 * handler since a hook's return value short-circuits the request directly.
 * This module builds its own `OpenAPIHono` with this hook instead of the
 * shared factory, so every schema validation failure on a KrabiClaw facade
 * route gets the same bounded `{ error: { code, message }, request_id }`
 * shape (code `validation_failed`, no request-derived detail) as every
 * other pre-D1 rejection (R23, R25).
 */
/**
 * `Hook`'s `T` (validated-data), `P` (path), and `R` (return) type parameters
 * vary per route — this hook is installed once as `defaultHook` and must
 * apply across every route's own schema, not one route's. `T` is `unknown`
 * (this hook never reads `result.data`), `P` is the widest legal `string`
 * (this hook never extracts a path param), and `R` is this function's own
 * concrete return type rather than `any`.
 */
export const krabiclawFacadeValidationHook: Hook<unknown, AppContext, string, Response | undefined> = (result, c) => {
  if (!result.success) {
    const response = c.json(
      {
        error: { code: 'validation_failed', message: 'Request failed facade validation' },
        request_id: c.get('requestId') ?? null,
      },
      400
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  return;
};
