import { createKrabiClawFacadeRouteMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { registerFacadeRoute } from '@/modules/krabiclaw-integration/route-registry';
import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';
import {
  krabiclawDependencyUnavailableResponse,
  krabiclawForbiddenResponse,
  krabiclawInvalidTokenResponse,
  krabiclawRateLimitedResponse,
  krabiclawUpstreamInvalidResponse,
  krabiclawValidationFailedResponse,
} from '@/modules/krabiclaw-integration/validations/facade-error-schemas';
import { krabiclawResourceNotFoundResponse } from '@/modules/krabiclaw-integration/validations/facade-route-error-responses';
import {
  krabiclawFacadeHeadersSchema,
  krabiclawStrictSchema,
} from '@/modules/krabiclaw-integration/validations/facade-schema.helpers';
import { practiceValidations } from '@/modules/practice/validations/practice.validation';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * Practice family facade routes (R1, R6-R9, R11, R14, R22, R26). No path
 * parameter — unlike the authenticated Blawby route
 * (`/api/practice/{practice_id}/details`), the organization is always
 * derived server-side from the verified `KrabiClawFacadeRequestContext`
 * (R14), never from the caller.
 *
 * TRUST BOUNDARY: `actorPolicy: 'human'` is the ONLY check Blawby performs
 * on every route in this file. It verifies the caller asserted a human
 * actor, not that the actor is Blawby firm staff or holds any owner/admin
 * role — the Implementation Constraints in the source plan
 * (docs/plans/2026-08-27-2110-feat-u8-blawby-facade-plan.md) explicitly
 * forbid this facade from manufacturing owner/admin role claims. KrabiClaw's
 * BFF (referred to as U9 in that plan — a separate, not-yet-built system) is
 * solely responsible for ensuring only an eligible actor for the operation
 * being performed reaches these routes. Do not read `actorPolicy: 'human'`
 * as a role/authorization check of any kind.
 */
const policyResponses = {
  400: krabiclawValidationFailedResponse,
  401: krabiclawInvalidTokenResponse,
  403: krabiclawForbiddenResponse,
  429: krabiclawRateLimitedResponse,
  502: krabiclawUpstreamInvalidResponse,
  503: krabiclawDependencyUnavailableResponse,
};

const getPracticeDetailsDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/practice/details',
  scope: 'legal:practice',
  actorPolicy: 'human',
  rateFamily: 'practice',
  rolloutGroup: 'practice-read',
  requestReferencePolicy: 'none',
};

const getPracticeDetailsRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: getPracticeDetailsDefinition.method,
  path: getPracticeDetailsDefinition.path,
  tags: ['KrabiClaw Facade', 'Practice'],
  summary: 'Get practice details (KrabiClaw facade)',
  description: 'Retrieve practice details for the caller-verified organization.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getPracticeDetailsDefinition)],
  request: { headers: krabiclawFacadeHeadersSchema },
  responses: {
    ...policyResponses,
    200: {
      description: 'Practice details retrieved successfully',
      content: { 'application/json': { schema: practiceValidations.practiceDetailsSingleResponseSchema } },
    },
    404: krabiclawResourceNotFoundResponse,
  },
});
registerFacadeRoute(getPracticeDetailsRoute, getPracticeDetailsDefinition);

/**
 * Strict facade DTO for practice-detail mutations (KTD5). Built from the
 * owning domain's `practiceDetailsValidationSchema` fields — that object
 * carries no organization/practice/user/slug/identity-email field, so
 * `krabiclawStrictSchema` accepts it unmodified while still rejecting any
 * OTHER unknown key a caller might add (R14).
 */
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
const practiceDetailsMutationFields = practiceValidations.practiceDetailsValidationSchema.shape;

const createPracticeDetailsFacadeSchema = krabiclawStrictSchema(practiceDetailsMutationFields).refine(
  (data) => practiceValidations.hasPracticeDetails(data),
  { message: 'At least one practice detail field must be provided' }
);

const updatePracticeDetailsFacadeSchema = krabiclawStrictSchema(practiceDetailsMutationFields);

const postPracticeDetailsDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/practice/details',
  scope: 'legal:practice',
  actorPolicy: 'human',
  rateFamily: 'practice',
  rolloutGroup: 'practice-mutation',
  requestReferencePolicy: 'none',
};

const postPracticeDetailsRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: postPracticeDetailsDefinition.method,
  path: postPracticeDetailsDefinition.path,
  tags: ['KrabiClaw Facade', 'Practice'],
  summary: 'Create practice details (KrabiClaw facade)',
  description: 'Create practice details for the caller-verified organization (upserts, matching the existing route).',
  middleware: [createKrabiClawFacadeRouteMiddleware(postPracticeDetailsDefinition)],
  request: {
    headers: krabiclawFacadeHeadersSchema,
    body: {
      content: { 'application/json': { schema: createPracticeDetailsFacadeSchema } },
      description: 'Practice details data',
    },
  },
  responses: {
    ...policyResponses,
    201: {
      description: 'Practice details created successfully',
      content: { 'application/json': { schema: practiceValidations.practiceDetailsCreateResponseSchema } },
    },
    404: krabiclawResourceNotFoundResponse,
  },
});
registerFacadeRoute(postPracticeDetailsRoute, postPracticeDetailsDefinition);

const patchPracticeDetailsDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'patch',
  path: '/practice/details',
  scope: 'legal:practice',
  actorPolicy: 'human',
  rateFamily: 'practice',
  rolloutGroup: 'practice-mutation',
  requestReferencePolicy: 'none',
};

const patchPracticeDetailsRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: patchPracticeDetailsDefinition.method,
  path: patchPracticeDetailsDefinition.path,
  tags: ['KrabiClaw Facade', 'Practice'],
  summary: 'Update practice details (KrabiClaw facade)',
  description: "Update practice details for the caller-verified organization (creates if it doesn't exist).",
  middleware: [createKrabiClawFacadeRouteMiddleware(patchPracticeDetailsDefinition)],
  request: {
    headers: krabiclawFacadeHeadersSchema,
    body: {
      content: { 'application/json': { schema: updatePracticeDetailsFacadeSchema } },
      description: 'Practice details update data',
    },
  },
  responses: {
    ...policyResponses,
    200: {
      description: 'Practice details updated successfully',
      content: { 'application/json': { schema: practiceValidations.practiceDetailsUpdateResponseSchema } },
    },
    404: krabiclawResourceNotFoundResponse,
  },
});
registerFacadeRoute(patchPracticeDetailsRoute, patchPracticeDetailsDefinition);

export {
  getPracticeDetailsDefinition,
  getPracticeDetailsRoute,
  createPracticeDetailsFacadeSchema,
  updatePracticeDetailsFacadeSchema,
  postPracticeDetailsDefinition,
  postPracticeDetailsRoute,
  patchPracticeDetailsDefinition,
  patchPracticeDetailsRoute,
};
