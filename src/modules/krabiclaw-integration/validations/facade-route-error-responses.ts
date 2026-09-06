import { krabiclawErrorEnvelopeSchema } from '@/modules/krabiclaw-integration/validations/facade-error-schemas';

/**
 * Route-family-owned Reviewed Error Contract response objects (KTD8). Unlike
 * the policy-layer codes in `facade-error-schemas.ts` (owned by U2's
 * `http.ts`'s `onError`, which has no branch for these), the codes below are
 * reserialized directly inside each route family's own handler — see
 * `handlers.ts`'s `mapPracticeOperationError` / `mapConnectOperationError` —
 * before the response ever reaches `onError`. These OpenAPI response objects
 * exist purely to document that reserialized shape; they are spread into a
 * route's `responses` alongside the policy-layer ones from
 * `facade-error-schemas.ts`.
 */
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: krabiclawErrorEnvelopeSchema } },
});

/** Practice and Connect: the requested resource does not exist for this organization. */
export const krabiclawResourceNotFoundResponse = errorResponse('The requested resource does not exist');
/** Practice, Connect, and staff intake: the request conflicts with existing state. */
export const krabiclawStateConflictResponse = errorResponse('The request conflicts with existing state');
/** Connect and intake: a prerequisite for this operation was not met. */
export const krabiclawPrerequisiteFailedResponse = errorResponse('A prerequisite for this operation was not met');
/** Public intake only: a same-key request conflicts with a prior recorded intake or checkout session. */
export const krabiclawRequestConflictResponse = errorResponse('The request conflicts with a prior recorded request');
/** Staff intake only: distinct from the policy layer's `facade_forbidden` — the authenticated staff actor may not access this specific resource. */
export const krabiclawStaffForbiddenResponse = errorResponse('Access to this resource is not permitted');
