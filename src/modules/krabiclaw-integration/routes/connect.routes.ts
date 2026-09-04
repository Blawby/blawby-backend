import { z } from '@hono/zod-openapi';

import { createKrabiClawFacadeRouteMiddleware } from '@/modules/krabiclaw-integration/middleware/krabiclaw-facade.middleware';
import { registerFacadeRoute } from '@/modules/krabiclaw-integration/route-registry';
import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';
import {
  krabiclawForbiddenResponse,
  krabiclawInvalidTokenResponse,
  krabiclawRateLimitedResponse,
  krabiclawValidationFailedResponse,
} from '@/modules/krabiclaw-integration/validations/facade-error-schemas';
import {
  krabiclawPrerequisiteFailedResponse,
  krabiclawResourceNotFoundResponse,
  krabiclawStateConflictResponse,
} from '@/modules/krabiclaw-integration/validations/facade-route-error-responses';
import { krabiclawStrictSchema } from '@/modules/krabiclaw-integration/validations/facade-schema.helpers';
import { onboardingValidations } from '@/modules/onboarding/validations/onboarding.validation';
import { connectValidations } from '@/modules/stripe/validations/connect.validation';
import { routeBuilder } from '@/shared/router/route-builder';

/**
 * Connect family facade routes (R1, R6-R9, R11, R13, R14, R22, R26, R28).
 * Every route is human-actor-only (Connect has no anonymous use case) and
 * derives its organization from the verified `KrabiClawFacadeRequestContext`
 * — never from the caller.
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
};

const connectDomainResponses = {
  404: krabiclawResourceNotFoundResponse,
  409: krabiclawStateConflictResponse,
  422: krabiclawPrerequisiteFailedResponse,
};

/**
 * R28: connected-account creation requires a strict UUID v4 `request_key`
 * body field, mapped to the existing organization-bound recovery
 * operation's `requestKey` param — the ordinary Blawby route
 * (`POST /api/onboarding/connected-accounts`) stays free to omit it.
 * `return_url`/`refresh_url` are accepted here (KTD7: U9 sends its own
 * configured values) but checked for bilateral exact equality against
 * `config.krabiclaw.connect.{returnUrl,refreshUrl}` in the handler before
 * any Stripe call or durable claim — never accepted as caller-controlled
 * destinations.
 */
const connectedAccountCreateSchema = krabiclawStrictSchema({
  request_key: z.uuidv4().openapi({
    description: 'KrabiClaw-supplied idempotent recovery key for this Connect operation (UUID v4)',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  return_url: z.url().openapi({ example: 'https://app.blawby.com/onboarding/return' }),
  refresh_url: z.url().openapi({ example: 'https://app.blawby.com/onboarding/refresh' }),
});

const postConnectedAccountsDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/connect/connected-accounts',
  scope: 'legal:connect',
  actorPolicy: 'human',
  rateFamily: 'connect',
  rolloutGroup: 'connect',
  requestReferencePolicy: 'none',
};

const postConnectedAccountsRoute = routeBuilder.build({
  method: postConnectedAccountsDefinition.method,
  path: postConnectedAccountsDefinition.path,
  tags: ['KrabiClaw Facade', 'Connect'],
  summary: 'Create a Stripe connected account (KrabiClaw facade)',
  description:
    'Creates (or recovers, by request_key) a Stripe connected account and hosted-onboarding session for the caller-verified organization.',
  middleware: [createKrabiClawFacadeRouteMiddleware(postConnectedAccountsDefinition)],
  request: {
    body: {
      content: { 'application/json': { schema: connectedAccountCreateSchema } },
      description: 'Connected account creation data',
    },
  },
  responses: {
    ...policyResponses,
    ...connectDomainResponses,
    201: {
      description: 'Connected account created or recovered successfully',
      content: { 'application/json': { schema: onboardingValidations.createConnectedAccountResponseSchema } },
    },
  },
});
registerFacadeRoute(postConnectedAccountsRoute, postConnectedAccountsDefinition);

const getConnectStatusDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/connect/status',
  scope: 'legal:connect',
  actorPolicy: 'human',
  rateFamily: 'connect',
  rolloutGroup: 'connect',
  requestReferencePolicy: 'none',
};

const getConnectStatusRoute = routeBuilder.build({
  method: getConnectStatusDefinition.method,
  path: getConnectStatusDefinition.path,
  tags: ['KrabiClaw Facade', 'Connect'],
  summary: 'Get Connect onboarding status (KrabiClaw facade)',
  description: 'Retrieve Stripe Connect onboarding status for the caller-verified organization.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getConnectStatusDefinition)],
  responses: {
    ...policyResponses,
    ...connectDomainResponses,
    200: {
      description: 'Connect status retrieved successfully',
      content: { 'application/json': { schema: onboardingValidations.onboardingStatusResponseSchema } },
    },
  },
});
registerFacadeRoute(getConnectStatusRoute, getConnectStatusDefinition);

// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `.shape` is Zod's built-in ZodObject API, not a renameable local symbol.
const accountSessionComponentsField = connectValidations.createAccountSessionSchema.shape.components;
const accountSessionCreateSchema = krabiclawStrictSchema({
  components: accountSessionComponentsField,
});

const postAccountSessionDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'post',
  path: '/connect/account-session',
  scope: 'legal:connect',
  actorPolicy: 'human',
  rateFamily: 'connect',
  rolloutGroup: 'connect',
  requestReferencePolicy: 'none',
};

const postAccountSessionRoute = routeBuilder.build({
  method: postAccountSessionDefinition.method,
  path: postAccountSessionDefinition.path,
  tags: ['KrabiClaw Facade', 'Connect'],
  summary: 'Create a Stripe account session (KrabiClaw facade)',
  description: 'Create an embedded Stripe Account Session for the caller-verified organization.',
  middleware: [createKrabiClawFacadeRouteMiddleware(postAccountSessionDefinition)],
  request: {
    body: {
      content: { 'application/json': { schema: accountSessionCreateSchema } },
      description: 'Requested embedded-component set',
    },
  },
  responses: {
    ...policyResponses,
    ...connectDomainResponses,
    201: {
      description: 'Account session created successfully',
      content: { 'application/json': { schema: connectValidations.accountSessionResponseSchema } },
    },
  },
});
registerFacadeRoute(postAccountSessionRoute, postAccountSessionDefinition);

const getConnectAccountDefinition: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/connect/account',
  scope: 'legal:connect',
  actorPolicy: 'human',
  rateFamily: 'connect',
  rolloutGroup: 'connect',
  requestReferencePolicy: 'none',
};

const getConnectAccountRoute = routeBuilder.build({
  method: getConnectAccountDefinition.method,
  path: getConnectAccountDefinition.path,
  tags: ['KrabiClaw Facade', 'Connect'],
  summary: 'Get the connected Stripe account (KrabiClaw facade)',
  description: 'Retrieve connected-account status and readiness for the caller-verified organization.',
  middleware: [createKrabiClawFacadeRouteMiddleware(getConnectAccountDefinition)],
  responses: {
    ...policyResponses,
    ...connectDomainResponses,
    200: {
      description: 'Connected account retrieved successfully',
      content: { 'application/json': { schema: onboardingValidations.getAccountResponseSchema } },
    },
  },
});
registerFacadeRoute(getConnectAccountRoute, getConnectAccountDefinition);

export {
  connectedAccountCreateSchema,
  postConnectedAccountsDefinition,
  postConnectedAccountsRoute,
  getConnectStatusDefinition,
  getConnectStatusRoute,
  accountSessionCreateSchema,
  postAccountSessionDefinition,
  postAccountSessionRoute,
  getConnectAccountDefinition,
  getConnectAccountRoute,
};
