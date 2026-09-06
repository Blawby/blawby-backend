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
  krabiclawResourceNotFoundResponse,
  krabiclawStateConflictResponse,
} from '@/modules/krabiclaw-integration/validations/facade-route-error-responses';
import {
  krabiclawFacadeHeadersSchema,
  krabiclawFacadeHeadersWithOriginatingIpSchema,
  krabiclawLocalResourceIdSchema,
  krabiclawStrictSchema,
} from '@/modules/krabiclaw-integration/validations/facade-schema.helpers';
import { engagementContractValidations } from '@/modules/engagement-contracts/validations/engagement-contract.validation';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * Engagement family facade routes (R1-R4, R6, R9, R11-R12, R14-R16,
 * R22-R27). No `practice_id`/`organization_id` path or body parameter
 * anywhere — the organization is always derived server-side from the
 * verified `KrabiClawFacadeRequestContext` (R14), never from the caller.
 * Human actor only (R11) — the owning operations themselves also enforce
 * this via `assertHumanActor`, so this is defense in depth, not the sole
 * check.
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

/** Every engagement route's reviewed domain 4xx codes are a subset of {404, 409} (`mapEngagementOperationError`, `handlers.ts`) — no route in this family produces a reviewed 422. */
const engagementNotFoundOnlyResponses = {
  404: krabiclawResourceNotFoundResponse,
};

const engagementDomainResponses = {
  404: krabiclawResourceNotFoundResponse,
  409: krabiclawStateConflictResponse,
};

const contractIdParamSchema = z.object({
  contract_id: krabiclawLocalResourceIdSchema.openapi({
    param: { name: 'contract_id', in: 'path' },
    description: 'Engagement contract ID (UUID)',
  }),
});

/**
 * POST /engagement-contracts — create. `intake_id` is a resource reference,
 * not a forbidden identity field (KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS),
 * so the owning `createEngagementContractSchema`'s shape is reused directly
 * (KTD5).
 */
const createEngagementContractDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/engagement-contracts',
  scope: 'legal:engagements',
  actorPolicy: 'human',
  rateFamily: 'engagement',
  rolloutGroup: 'engagement',
  requestReferencePolicy: 'none',
};

const createEngagementContractFacadeSchema = krabiclawStrictSchema(
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
  engagementContractValidations.createEngagementContractSchema.shape
);

const createEngagementContractRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: createEngagementContractDefinition.method,
  path: createEngagementContractDefinition.path,
  tags: ['KrabiClaw Facade', 'Engagement Contracts'],
  summary: 'Create an engagement contract (KrabiClaw facade)',
  description:
    'Creates a draft engagement contract for an accepted intake, for the caller-verified organization. ' +
    'Blawby verifies only that the caller asserted a human actor, not firm-staff membership or role — the KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(createEngagementContractDefinition)],
  request: {
    headers: krabiclawFacadeHeadersSchema,
    body: {
      content: { 'application/json': { schema: createEngagementContractFacadeSchema } },
      description: 'Engagement contract creation data',
    },
  },
  responses: {
    ...policyResponses,
    ...engagementDomainResponses,
    201: {
      description: 'Engagement contract created',
      content: { 'application/json': { schema: engagementContractValidations.engagementContractSchema } },
    },
  },
});
registerFacadeRoute(createEngagementContractRoute, createEngagementContractDefinition);

/**
 * GET /engagement-contracts — list. Preserves the shared Blawby offset
 * pagination envelope (R16), matching the authenticated route's own inline
 * response shape (`engagement-contracts/routes/core.routes.ts`).
 */
const listEngagementContractsDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/engagement-contracts',
  scope: 'legal:engagements',
  actorPolicy: 'human',
  rateFamily: 'engagement',
  rolloutGroup: 'engagement',
  requestReferencePolicy: 'none',
};

const listEngagementContractsQueryFacadeSchema = krabiclawStrictSchema(
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
  engagementContractValidations.listEngagementContractsQuerySchema.shape
);

const listEngagementContractsResponseSchema = z.object({
  data: z.array(engagementContractValidations.engagementContractSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
});

const listEngagementContractsRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: listEngagementContractsDefinition.method,
  path: listEngagementContractsDefinition.path,
  tags: ['KrabiClaw Facade', 'Engagement Contracts'],
  summary: 'List engagement contracts (KrabiClaw facade)',
  description:
    'Retrieves a paginated list of engagement contracts for the caller-verified organization. ' +
    'Blawby verifies only that the caller asserted a human actor, not firm-staff membership or role — the KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(listEngagementContractsDefinition)],
  request: { headers: krabiclawFacadeHeadersSchema, query: listEngagementContractsQueryFacadeSchema },
  responses: {
    ...policyResponses,
    ...engagementNotFoundOnlyResponses,
    200: {
      description: 'List of engagement contracts retrieved successfully',
      content: { 'application/json': { schema: listEngagementContractsResponseSchema } },
    },
  },
});
registerFacadeRoute(listEngagementContractsRoute, listEngagementContractsDefinition);

/** GET /engagement-contracts/{contract_id} — get. */
const getEngagementContractDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/engagement-contracts/{contract_id}',
  scope: 'legal:engagements',
  actorPolicy: 'human',
  rateFamily: 'engagement',
  rolloutGroup: 'engagement',
  requestReferencePolicy: 'none',
};

const getEngagementContractRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: getEngagementContractDefinition.method,
  path: getEngagementContractDefinition.path,
  tags: ['KrabiClaw Facade', 'Engagement Contracts'],
  summary: 'Get an engagement contract (KrabiClaw facade)',
  description:
    'Retrieves a single engagement contract by ID for the caller-verified organization. ' +
    'Blawby verifies only that the caller asserted a human actor, not firm-staff membership or role — the KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getEngagementContractDefinition)],
  request: { headers: krabiclawFacadeHeadersSchema, params: contractIdParamSchema },
  responses: {
    ...policyResponses,
    ...engagementNotFoundOnlyResponses,
    200: {
      description: 'Engagement contract retrieved successfully',
      content: { 'application/json': { schema: engagementContractValidations.engagementContractSchema } },
    },
  },
});
registerFacadeRoute(getEngagementContractRoute, getEngagementContractDefinition);

/** PATCH /engagement-contracts/{contract_id} — update. Only a `draft` contract may be updated (owning operation's own state check, reserialized as `409 state_conflict`). */
const updateEngagementContractDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'patch',
  path: '/engagement-contracts/{contract_id}',
  scope: 'legal:engagements',
  actorPolicy: 'human',
  rateFamily: 'engagement',
  rolloutGroup: 'engagement',
  requestReferencePolicy: 'none',
};

const updateEngagementContractFacadeSchema = krabiclawStrictSchema(
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
  engagementContractValidations.updateEngagementContractSchema.shape
);

const updateEngagementContractRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: updateEngagementContractDefinition.method,
  path: updateEngagementContractDefinition.path,
  tags: ['KrabiClaw Facade', 'Engagement Contracts'],
  summary: 'Update a draft engagement contract (KrabiClaw facade)',
  description:
    'Updates a draft engagement contract for the caller-verified organization. ' +
    'Blawby verifies only that the caller asserted a human actor, not firm-staff membership or role — the KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(updateEngagementContractDefinition)],
  request: {
    headers: krabiclawFacadeHeadersSchema,
    params: contractIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateEngagementContractFacadeSchema } },
      description: 'Engagement contract update data',
    },
  },
  responses: {
    ...policyResponses,
    ...engagementDomainResponses,
    200: {
      description: 'Engagement contract updated',
      content: { 'application/json': { schema: engagementContractValidations.engagementContractSchema } },
    },
  },
});
registerFacadeRoute(updateEngagementContractRoute, updateEngagementContractDefinition);

/**
 * PATCH /engagement-contracts/{contract_id}/status — status-action dispatch
 * (send/decline/accept), mirroring the existing authenticated Blawby route's
 * own dispatch shape (`engagement-contracts/routes/core.routes.ts`'s
 * `updateEngagementContractStatusRoute`) rather than inventing a new one.
 *
 * `acceptsOriginatingClientIp: true` — this is the ONLY route in the entire
 * facade permitted to carry the trusted originating-client-IP header (R27).
 * Because all three status actions share one Hono route, the header is
 * policy-permitted for every action's request, but `handlers.ts`'s dispatch
 * handler only ever reads and forwards it inside the `accepted` branch —
 * `send` and `decline` never touch `ctx.trustedOriginatingClientIp`.
 */
const updateEngagementContractStatusDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'patch',
  path: '/engagement-contracts/{contract_id}/status',
  scope: 'legal:engagements',
  actorPolicy: 'human',
  rateFamily: 'engagement',
  rolloutGroup: 'engagement',
  requestReferencePolicy: 'none',
  acceptsOriginatingClientIp: true,
};

const updateEngagementContractStatusFacadeSchema = krabiclawStrictSchema(
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
  engagementContractValidations.updateEngagementContractStatusSchema.shape
);

const updateEngagementContractStatusRoute = routeBuilder.build({
  // The facade never returns a bare 500 — every failure is reserialized into a reviewed 4xx/5xx code (KTD8).
  excludeDefaultResponses: [500],
  method: updateEngagementContractStatusDefinition.method,
  path: updateEngagementContractStatusDefinition.path,
  tags: ['KrabiClaw Facade', 'Engagement Contracts'],
  summary: 'Transition an engagement contract status (KrabiClaw facade)',
  description:
    'Dispatches a status-action (send, accept, or decline) for an engagement contract. ' +
    'Blawby verifies only that the caller asserted a human actor, not firm-staff membership or role — the KrabiClaw BFF is solely responsible for actor eligibility.',
  middleware: [createKrabiClawFacadeRouteMiddleware(updateEngagementContractStatusDefinition)],
  request: {
    headers: krabiclawFacadeHeadersWithOriginatingIpSchema,
    params: contractIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateEngagementContractStatusFacadeSchema } },
      description: 'Engagement contract status transition',
    },
  },
  responses: {
    ...policyResponses,
    ...engagementDomainResponses,
    200: {
      description: 'Engagement contract status updated',
      content: { 'application/json': { schema: engagementContractValidations.engagementContractSchema } },
    },
  },
});
registerFacadeRoute(updateEngagementContractStatusRoute, updateEngagementContractStatusDefinition);

export {
  createEngagementContractDefinition,
  createEngagementContractRoute,
  createEngagementContractFacadeSchema,
  listEngagementContractsDefinition,
  listEngagementContractsRoute,
  listEngagementContractsResponseSchema,
  getEngagementContractDefinition,
  getEngagementContractRoute,
  updateEngagementContractDefinition,
  updateEngagementContractRoute,
  updateEngagementContractFacadeSchema,
  updateEngagementContractStatusDefinition,
  updateEngagementContractStatusRoute,
  updateEngagementContractStatusFacadeSchema,
};
