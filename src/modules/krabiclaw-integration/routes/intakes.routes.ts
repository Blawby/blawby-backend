import { z } from '@hono/zod-openapi';

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
import {
  krabiclawPrerequisiteFailedResponse,
  krabiclawRequestConflictResponse,
  krabiclawResourceNotFoundResponse,
  krabiclawStaffForbiddenResponse,
} from '@/modules/krabiclaw-integration/validations/facade-route-error-responses';
import {
  krabiclawFacadeHeadersSchema,
  krabiclawFacadeHeadersWithRequestReferenceSchema,
  krabiclawLocalResourceIdSchema,
  krabiclawRequestReferenceSchema,
  krabiclawStrictSchema,
} from '@/modules/krabiclaw-integration/validations/facade-schema.helpers';
import { intakeValidations } from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * Intake family facade routes (R1, R5-R12, R14-R16, R18, R22-R26). No
 * `practice_id`/`slug` path or body parameter anywhere — the organization is
 * always derived server-side from the verified `KrabiClawFacadeRequestContext`
 * (R14), never from the caller.
 *
 * Route registration order in `http.ts` matters (see that file's own
 * doc comment on `mountKrabiClawFacadeTerminalHandlers`): Hono matches
 * routes in registration order, not by static-vs-dynamic specificity, and
 * `GET /intakes/settings` and `GET /intakes/{uuid}` are both two-segment GET
 * routes — `getIntakeSettingsRoute` MUST be registered before
 * `getIntakeRoute` or a request for `/intakes/settings` could be captured by
 * the `{uuid}` route instead.
 */
const policyResponses = {
  400: krabiclawValidationFailedResponse,
  401: krabiclawInvalidTokenResponse,
  403: krabiclawForbiddenResponse,
  429: krabiclawRateLimitedResponse,
  502: krabiclawUpstreamInvalidResponse,
  503: krabiclawDependencyUnavailableResponse,
};

/**
 * Public intake, ownership/request-reference/existence mismatches only —
 * these two handlers (`status`, recovery-by-reference) only ever produce a
 * 404 (`mapPublicIntakeAccessError`, `intakes.handlers.ts`), all
 * indistinguishable per R14.
 */
const publicIntakeNotFoundOnlyResponses = {
  404: krabiclawResourceNotFoundResponse,
};

/** Public intake settings: `mapIntakeSettingsOperationError` only ever produces 404 or 422 — no 409 case exists for this read-only route. */
const publicIntakeSettingsResponses = {
  404: krabiclawResourceNotFoundResponse,
  422: krabiclawPrerequisiteFailedResponse,
};

/** Public intake create/checkout: the full set of reviewed codes their handlers' error mappers can produce (404/409/422), per the Reviewed Error Contract table. */
const publicIntakeFullDomainResponses = {
  404: krabiclawResourceNotFoundResponse,
  409: krabiclawRequestConflictResponse,
  422: krabiclawPrerequisiteFailedResponse,
};

/** Public intake post-pay/status: `mapPostPayOperationError` only ever produces 404 or 409 — `verifyPostPayConsistency` has no 422 case. */
const publicPostPayResponses = {
  404: krabiclawResourceNotFoundResponse,
  409: krabiclawRequestConflictResponse,
};

/**
 * Staff intake: unlike the public family, a staff-actor 403 is disclosed
 * (`krabiclawStaffForbiddenResponse`, code `forbidden`) rather than folded
 * into 404 — staff are known identified actors, not anonymous probes, so R14's
 * indistinguishability requirement (which targets public cross-reference
 * failures specifically) does not apply here.
 */
const staffIntakeDomainResponses = {
  403: krabiclawStaffForbiddenResponse,
  404: krabiclawResourceNotFoundResponse,
};

const intakeUuidParamSchema = z.object({
  uuid: krabiclawLocalResourceIdSchema.openapi({
    param: { name: 'uuid', in: 'path' },
    description: 'Practice client intake UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

const requestReferencePathParamSchema = z.object({
  request_id: krabiclawRequestReferenceSchema.openapi({
    param: { name: 'request_id', in: 'path' },
    description: 'KrabiClaw request reference (UUID v4) supplied when the intake was created',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
});

/**
 * GET /intakes/settings — human or anonymous, no request reference (there is
 * no specific intake to bind to yet).
 */
const getIntakeSettingsDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/intakes/settings',
  scope: 'legal:intakes',
  actorPolicy: 'human-or-anonymous',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'none',
};

// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
const intakeSettingsQueryFacadeSchema = krabiclawStrictSchema(intakeValidations.getIntakeSettingsQuerySchema.shape);

const getIntakeSettingsRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: getIntakeSettingsDefinition.method,
  path: getIntakeSettingsDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Get intake settings (KrabiClaw facade)',
  description: 'Retrieve public intake settings for the caller-verified organization.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getIntakeSettingsDefinition)],
  request: { headers: krabiclawFacadeHeadersSchema, query: intakeSettingsQueryFacadeSchema },
  responses: {
    ...policyResponses,
    ...publicIntakeSettingsResponses,
    200: {
      description: 'Intake settings retrieved successfully',
      content: { 'application/json': { schema: intakeValidations.practiceClientIntakeSettingsResponseSchema } },
    },
  },
});
registerFacadeRoute(getIntakeSettingsRoute, getIntakeSettingsDefinition);

/**
 * POST /intakes — human or anonymous. `requestReferencePolicy: 'required'`
 * (R5): the browser-generated request reference is always supplied at
 * creation, persisted as `krabiclaw_request_key`, and reused for recovery and
 * anonymous follow-up authorization by every other route below.
 */
const postIntakesDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/intakes',
  scope: 'legal:intakes',
  actorPolicy: 'human-or-anonymous',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'required',
};

/**
 * `slug` and `user_id` are forbidden identity fields (`KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS`)
 * — the owning schema carries both, so they are omitted before building the
 * strict facade DTO (KTD5). Organization is derived from context; the acting
 * user (when human) is derived from `ctx.legalOperationContext.userId`, never
 * the request body.
 */
const createIntakeFacadeObjectSchema = intakeValidations.createPracticeClientIntakeSchema.omit({
  slug: true,
  user_id: true,
});
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
const createIntakeFacadeFields = createIntakeFacadeObjectSchema.shape;
const createIntakeFacadeSchema = krabiclawStrictSchema(createIntakeFacadeFields);

const postIntakesRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: postIntakesDefinition.method,
  path: postIntakesDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Create a practice client intake (KrabiClaw facade)',
  description:
    'Creates (or recovers, by the trusted request reference) a practice client intake for the caller-verified organization.',
  middleware: [createKrabiClawFacadeRouteMiddleware(postIntakesDefinition)],
  request: {
    headers: krabiclawFacadeHeadersWithRequestReferenceSchema,
    body: {
      content: { 'application/json': { schema: createIntakeFacadeSchema } },
      description: 'Intake submission data',
    },
  },
  responses: {
    ...policyResponses,
    ...publicIntakeFullDomainResponses,
    201: {
      description: 'Intake created or recovered successfully',
      content: { 'application/json': { schema: intakeValidations.createPracticeClientIntakeResponseSchema } },
    },
  },
});
registerFacadeRoute(postIntakesRoute, postIntakesDefinition);

/**
 * GET /intakes/requests/{request_id} — request-reference-based recovery. The
 * path parameter itself IS the KrabiClaw request reference (not an intake
 * UUID) and functions as the proof of correlation for this lookup, so no
 * separate trusted header is required for this specific route
 * (`requestReferencePolicy: 'none'`) — `getIntakeByRequestReference` performs
 * the equality check against the stored `krabiclaw_request_key` directly.
 */
const getIntakeByRequestReferenceDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/intakes/requests/{request_id}',
  scope: 'legal:intakes',
  actorPolicy: 'human-or-anonymous',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'none',
};

const getIntakeByRequestReferenceRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: getIntakeByRequestReferenceDefinition.method,
  path: getIntakeByRequestReferenceDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Recover a practice client intake by request reference (KrabiClaw facade)',
  description: 'Recovers a previously created intake for the caller-verified organization by its request reference.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getIntakeByRequestReferenceDefinition)],
  request: { headers: krabiclawFacadeHeadersSchema, params: requestReferencePathParamSchema },
  responses: {
    ...policyResponses,
    ...publicIntakeNotFoundOnlyResponses,
    200: {
      description: 'Intake recovered successfully',
      content: { 'application/json': { schema: intakeValidations.createPracticeClientIntakeResponseSchema } },
    },
  },
});
registerFacadeRoute(getIntakeByRequestReferenceRoute, getIntakeByRequestReferenceDefinition);

/**
 * GET /intakes/{uuid}/status — human or anonymous follow-up, keyed by intake
 * UUID rather than the request reference, so the trusted header is required
 * here and compared against the intake's stored `krabiclaw_request_key`
 * (KTD6) — see `intakes.handlers.ts`.
 */
const getIntakeStatusDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/intakes/{uuid}/status',
  scope: 'legal:intakes',
  actorPolicy: 'human-or-anonymous',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'required',
};

const getIntakeStatusRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: getIntakeStatusDefinition.method,
  path: getIntakeStatusDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Get practice client intake status (KrabiClaw facade)',
  description: 'Retrieves the current status of an intake, authorized by the trusted request reference.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getIntakeStatusDefinition)],
  request: { headers: krabiclawFacadeHeadersWithRequestReferenceSchema, params: intakeUuidParamSchema },
  responses: {
    ...policyResponses,
    ...publicIntakeNotFoundOnlyResponses,
    200: {
      description: 'Status retrieved successfully',
      content: { 'application/json': { schema: intakeValidations.practiceClientIntakeStatusResponseSchema } },
    },
  },
});
registerFacadeRoute(getIntakeStatusRoute, getIntakeStatusDefinition);

/**
 * GET /intakes, GET /intakes/{uuid}, and PATCH /intakes/{uuid}/triage below
 * are "staff-only" by KrabiClaw's product contract — `getIntakeById` and
 * `listIntakes` return the full admin projection (including internal
 * AI-triage fields) and the full organization-wide intake list,
 * respectively. Blawby enforces ONLY `actorPolicy: 'human'` on these three
 * routes — there is no independent staff/role verification on this side.
 * `actorPolicy: 'human'` passes for ANY human actor KrabiClaw's BFF asserts
 * via the trusted headers; per the Implementation Constraints in the source
 * plan (docs/plans/2026-08-27-2110-feat-u8-blawby-facade-plan.md), this
 * facade must not manufacture owner/admin role claims. KrabiClaw's BFF
 * (referred to as U9 in that plan — a separate, not-yet-built system) is
 * solely responsible for ensuring only verified firm-staff actors are ever
 * routed to these three routes. Do not read "staff-only" in any comment
 * below, or `actorPolicy: 'human'` itself, as an authorization guarantee —
 * flipping the `intake-without-payment` rollout-group flag on exposes the
 * organization's full intake list and admin-projection fields to every
 * human actor KrabiClaw's BFF chooses to assert as human.
 */

/**
 * GET /intakes — staff-only (human actor), preserves the shared Blawby
 * offset pagination envelope (R16) via `listIntakesResponseSchema`.
 */
const listIntakesDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/intakes',
  scope: 'legal:intakes',
  actorPolicy: 'human',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'none',
};

// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
const listIntakesQueryFacadeSchema = krabiclawStrictSchema(intakeValidations.listIntakesQuerySchema.shape);

const listIntakesRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: listIntakesDefinition.method,
  path: listIntakesDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'List practice client intakes (KrabiClaw facade)',
  description:
    'Retrieves a paginated list of client intakes for the caller-verified organization. Staff-only by ' +
    'product contract — Blawby verifies only that the caller asserted a human actor, not firm-staff ' +
    'membership or role; the KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(listIntakesDefinition)],
  request: { headers: krabiclawFacadeHeadersSchema, query: listIntakesQueryFacadeSchema },
  responses: {
    ...policyResponses,
    ...staffIntakeDomainResponses,
    200: {
      description: 'List of intakes retrieved successfully',
      content: { 'application/json': { schema: intakeValidations.listIntakesResponseSchema } },
    },
  },
});
registerFacadeRoute(listIntakesRoute, listIntakesDefinition);

/**
 * GET /intakes/{uuid} — staff-only. Registered AFTER
 * `getIntakeSettingsRoute` (see the file-level doc comment above) so
 * `/intakes/settings` cannot be captured by this route's `{uuid}` param.
 */
const getIntakeDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/intakes/{uuid}',
  scope: 'legal:intakes',
  actorPolicy: 'human',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'none',
};

const getIntakeRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: getIntakeDefinition.method,
  path: getIntakeDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Get a practice client intake (KrabiClaw facade)',
  description:
    'Retrieves a single client intake by UUID for the caller-verified organization. Staff-only by ' +
    'product contract — Blawby verifies only that the caller asserted a human actor, not firm-staff ' +
    'membership or role; the KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getIntakeDefinition)],
  request: { headers: krabiclawFacadeHeadersSchema, params: intakeUuidParamSchema },
  responses: {
    ...policyResponses,
    ...staffIntakeDomainResponses,
    200: {
      description: 'Intake retrieved successfully',
      content: { 'application/json': { schema: intakeValidations.practiceClientIntakeStatusResponseSchema } },
    },
  },
});
registerFacadeRoute(getIntakeRoute, getIntakeDefinition);

/** PATCH /intakes/{uuid}/triage — staff-only. */
const patchIntakeTriageDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'patch',
  path: '/intakes/{uuid}/triage',
  scope: 'legal:intakes',
  actorPolicy: 'human',
  rateFamily: 'intake',
  rolloutGroup: 'intake-without-payment',
  requestReferencePolicy: 'none',
};

/** Mirrors `intakeValidations.updateIntakeTriageStatusSchema`'s shape and `superRefine`, rebuilt on top of `krabiclawStrictSchema` (KTD5) since that schema is a `ZodEffects`, not a plain object, and has no `.shape` to reuse directly. */
const triageStatusFacadeSchema = krabiclawStrictSchema({
  status: z.enum(['accepted', 'declined']),
  reason: z.string().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'declined' && !value.reason?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Reason is required when declining an intake' });
  }
});

const patchIntakeTriageRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: patchIntakeTriageDefinition.method,
  path: patchIntakeTriageDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Update intake triage status (KrabiClaw facade)',
  description:
    'Sets the practice triage decision for an intake. Staff-only by product contract — Blawby ' +
    'verifies only that the caller asserted a human actor, not firm-staff membership or role; the ' +
    'KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(patchIntakeTriageDefinition)],
  request: {
    headers: krabiclawFacadeHeadersSchema,
    params: intakeUuidParamSchema,
    body: { content: { 'application/json': { schema: triageStatusFacadeSchema } } },
  },
  responses: {
    ...policyResponses,
    ...staffIntakeDomainResponses,
    200: {
      description: 'Triage status updated successfully',
      content: { 'application/json': { schema: intakeValidations.updateIntakeTriageStatusResponseSchema } },
    },
  },
});
registerFacadeRoute(patchIntakeTriageRoute, patchIntakeTriageDefinition);

/**
 * POST /intakes/{uuid}/checkout-session — human or anonymous follow-up,
 * intake-payment rollout group. Destination-charge Stripe operation only
 * (`createCheckoutSession`, U1-era) — no new payment lifecycle is added here.
 */
const postCheckoutSessionDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/intakes/{uuid}/checkout-session',
  scope: 'legal:intakes',
  actorPolicy: 'human-or-anonymous',
  rateFamily: 'intake',
  rolloutGroup: 'intake-payment',
  requestReferencePolicy: 'required',
};

const postCheckoutSessionRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: postCheckoutSessionDefinition.method,
  path: postCheckoutSessionDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Create a Checkout Session for an intake (KrabiClaw facade)',
  description: 'Creates a Stripe Checkout Session for an existing intake, authorized by the trusted request reference.',
  middleware: [createKrabiClawFacadeRouteMiddleware(postCheckoutSessionDefinition)],
  request: { headers: krabiclawFacadeHeadersWithRequestReferenceSchema, params: intakeUuidParamSchema },
  responses: {
    ...policyResponses,
    ...publicIntakeFullDomainResponses,
    201: {
      description: 'Checkout Session created successfully',
      content: {
        'application/json': { schema: intakeValidations.createPracticeClientIntakeCheckoutSessionResponseSchema },
      },
    },
  },
});
registerFacadeRoute(postCheckoutSessionRoute, postCheckoutSessionDefinition);

/**
 * GET /intakes/{uuid}/post-pay/status — human or anonymous follow-up,
 * intake-payment rollout group. Delegates entirely to U1's
 * `verifyPostPayConsistency` (R10), a non-mutating correlation check — no
 * new payment lifecycle is added here.
 */
const getPostPayStatusDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/intakes/{uuid}/post-pay/status',
  scope: 'legal:intakes',
  actorPolicy: 'human-or-anonymous',
  rateFamily: 'intake',
  rolloutGroup: 'intake-payment',
  requestReferencePolicy: 'required',
};

// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
const postPayStatusQueryFacadeSchema = krabiclawStrictSchema(intakeValidations.checkoutSessionStatusQuerySchema.shape);

const getPostPayStatusRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: getPostPayStatusDefinition.method,
  path: getPostPayStatusDefinition.path,
  tags: ['KrabiClaw Facade', 'Intakes'],
  summary: 'Get post-pay status for an intake (KrabiClaw facade)',
  description:
    'Verifies that organization, intake UUID, Stripe Checkout Session, and the trusted request reference all describe the same intake before returning payment status.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getPostPayStatusDefinition)],
  request: {
    headers: krabiclawFacadeHeadersWithRequestReferenceSchema,
    params: intakeUuidParamSchema,
    query: postPayStatusQueryFacadeSchema,
  },
  responses: {
    ...policyResponses,
    ...publicPostPayResponses,
    200: {
      description: 'Post-pay status retrieved',
      content: { 'application/json': { schema: intakeValidations.practiceClientIntakePostPayStatusResponseSchema } },
    },
  },
});
registerFacadeRoute(getPostPayStatusRoute, getPostPayStatusDefinition);

export {
  getIntakeSettingsDefinition,
  getIntakeSettingsRoute,
  postIntakesDefinition,
  postIntakesRoute,
  createIntakeFacadeSchema,
  getIntakeByRequestReferenceDefinition,
  getIntakeByRequestReferenceRoute,
  getIntakeStatusDefinition,
  getIntakeStatusRoute,
  listIntakesDefinition,
  listIntakesRoute,
  getIntakeDefinition,
  getIntakeRoute,
  patchIntakeTriageDefinition,
  patchIntakeTriageRoute,
  triageStatusFacadeSchema,
  postCheckoutSessionDefinition,
  postCheckoutSessionRoute,
  getPostPayStatusDefinition,
  getPostPayStatusRoute,
};
