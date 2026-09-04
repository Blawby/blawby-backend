import { z } from '@hono/zod-openapi';

/**
 * The Reviewed Error Contract's bounded envelope. Every facade error
 * response — including the policy-layer ones this unit produces and every
 * route-family 4xx a later unit reserializes (KTD8) — uses this shape, not
 * the app-wide `{ error: string, message, request_id }` shape from
 * `src/shared/validations/openapi.ts`. Route files under this module must
 * override `routeBuilder.build(...)`'s default 400/401/403/404/500
 * responses with schemas built from `krabiclawErrorEnvelopeSchema` (or the
 * exported per-code response objects below) — the shared defaults describe
 * the wrong body shape for this module.
 */
const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  request_id: z.string().nullable(),
});

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorEnvelopeSchema } },
});

export const krabiclawErrorEnvelopeSchema = errorEnvelopeSchema;

/** Spread into a route's `responses` to describe the policy-layer 401 (machine auth) contract. */
export const krabiclawInvalidTokenResponse = errorResponse('Machine-token authentication failed');
/** Spread into a route's `responses` to describe the policy-layer 403 (scope/actor/rollout-group) contract. */
export const krabiclawForbiddenResponse = errorResponse('Request is not permitted by facade policy');
/** Spread into a route's `responses` to describe the policy-layer 429 (rate limit) contract. */
export const krabiclawRateLimitedResponse = errorResponse('Request exceeded a facade rate limit');
/** Spread into a route's `responses` to describe a pre-D1 header/body validation failure. */
export const krabiclawValidationFailedResponse = errorResponse('Request failed facade validation');
/**
 * Spread into every route's `responses` — `http.ts`'s `onError` sanitizes any unrecognized
 * upstream 4xx contract to this (never a bare 500; see that file's own doc comment). Reachable
 * from any route, not specific to one family.
 */
export const krabiclawUpstreamInvalidResponse = errorResponse('An unrecognized upstream dependency response');
/** Spread into every route's `responses` — `http.ts`'s `onError` sanitizes a dependency timeout, outage, or unexpected error (5xx or unstatused) to this. Reachable from any route. */
export const krabiclawDependencyUnavailableResponse = errorResponse('A facade dependency is unavailable');
