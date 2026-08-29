import type { Context } from 'hono';

import { KrabiClawFacadeValidationError } from '@/modules/krabiclaw-integration/errors/facade-errors';
import type { KrabiClawFacadeHeaders } from '@/modules/krabiclaw-integration/types/facade-headers.types';
import {
  krabiclawExternalIdSchema,
  krabiclawIpAddressSchema,
  krabiclawRequestReferenceSchema,
} from '@/modules/krabiclaw-integration/validations/facade-schema.helpers';
import type { z } from '@hono/zod-openapi';

const ORGANIZATION_HEADER = 'x-krabiclaw-organization-id';
const ACTOR_ID_HEADER = 'x-krabiclaw-actor-id';
const ACTOR_KIND_HEADER = 'x-krabiclaw-actor-kind';
const REQUEST_REFERENCE_HEADER = 'x-krabiclaw-request-reference';
const ORIGINATING_CLIENT_IP_HEADER = 'x-krabiclaw-originating-client-ip';

const requireSingleHeader = (c: Context, name: string): string => {
  const value = c.req.header(name);
  if (!value || value.includes(',')) {
    throw new KrabiClawFacadeValidationError(`Missing or duplicated header: ${name}`);
  }
  return value;
};

const readOptionalSingleHeader = (c: Context, name: string): string | null => {
  const value = c.req.header(name);
  if (value === undefined) {
    return null;
  }
  if (value.trim() === '' || value.includes(',')) {
    throw new KrabiClawFacadeValidationError(`Malformed or duplicated header: ${name}`);
  }
  return value;
};

/** Validate an already-extracted header value against a bound (R23) — never re-reads the header, so a caller can't smuggle a second value past `requireSingleHeader`/`readOptionalSingleHeader`. */
const assertBounded = (name: string, value: string, schema: z.ZodType<string>): void => {
  if (!schema.safeParse(value).success) {
    throw new KrabiClawFacadeValidationError(`Malformed header: ${name}`);
  }
};

export const parseFacadeHeaders = (c: Context): KrabiClawFacadeHeaders => {
  const externalOrganizationId = requireSingleHeader(c, ORGANIZATION_HEADER);
  assertBounded(ORGANIZATION_HEADER, externalOrganizationId, krabiclawExternalIdSchema);

  const actorKindRaw = requireSingleHeader(c, ACTOR_KIND_HEADER);
  if (actorKindRaw !== 'human' && actorKindRaw !== 'anonymous') {
    throw new KrabiClawFacadeValidationError(`Invalid ${ACTOR_KIND_HEADER}: ${actorKindRaw}`);
  }

  /**
   * R4/R20 — required for both actor kinds. A Better Auth anonymous actor
   * still has a concrete external ID (A3); it is retained here for
   * attribution and request-binding, but `createKrabiClawFacadeRouteMiddleware`'s
   * identity resolution only ever looks it up against D1 when
   * `actorKind === 'human'` — an anonymous ID never triggers a D1 user
   * lookup or a local user anchor.
   */
  const externalActorId = requireSingleHeader(c, ACTOR_ID_HEADER);
  assertBounded(ACTOR_ID_HEADER, externalActorId, krabiclawExternalIdSchema);

  const requestReference = readOptionalSingleHeader(c, REQUEST_REFERENCE_HEADER);
  if (requestReference !== null) {
    assertBounded(REQUEST_REFERENCE_HEADER, requestReference, krabiclawRequestReferenceSchema);
  }

  const trustedOriginatingClientIp = readOptionalSingleHeader(c, ORIGINATING_CLIENT_IP_HEADER);
  if (trustedOriginatingClientIp !== null) {
    assertBounded(ORIGINATING_CLIENT_IP_HEADER, trustedOriginatingClientIp, krabiclawIpAddressSchema);
  }

  return {
    externalOrganizationId,
    externalActorId,
    actorKind: actorKindRaw,
    requestReference,
    trustedOriginatingClientIp,
  };
};
