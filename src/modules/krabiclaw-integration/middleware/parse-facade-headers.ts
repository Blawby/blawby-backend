import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { KrabiClawFacadeHeaders } from '@/modules/krabiclaw-integration/types/facade-headers.types';

const ORGANIZATION_HEADER = 'x-krabiclaw-organization-id';
const ACTOR_ID_HEADER = 'x-krabiclaw-actor-id';
const ACTOR_KIND_HEADER = 'x-krabiclaw-actor-kind';

const requireSingleHeader = (c: Context, name: string): string => {
  const value = c.req.header(name);
  if (!value || value.includes(',')) {
    throw new HTTPException(400, { message: `Missing or duplicated header: ${name}` });
  }
  return value;
};

const readOptionalSingleHeader = (c: Context, name: string): string | null => {
  const value = c.req.header(name);
  if (value === undefined) {
    return null;
  }
  if (value.includes(',')) {
    throw new HTTPException(400, { message: `Duplicated header: ${name}` });
  }
  return value;
};

export const parseFacadeHeaders = (c: Context): KrabiClawFacadeHeaders => {
  const externalOrganizationId = requireSingleHeader(c, ORGANIZATION_HEADER);
  const actorKindRaw = requireSingleHeader(c, ACTOR_KIND_HEADER);

  if (actorKindRaw !== 'human' && actorKindRaw !== 'anonymous') {
    throw new HTTPException(400, { message: `Invalid ${ACTOR_KIND_HEADER}: ${actorKindRaw}` });
  }

  const externalActorId = readOptionalSingleHeader(c, ACTOR_ID_HEADER);

  if (actorKindRaw === 'human' && !externalActorId) {
    throw new HTTPException(400, { message: `${ACTOR_ID_HEADER} is required when ${ACTOR_KIND_HEADER} is human` });
  }
  if (actorKindRaw === 'anonymous' && externalActorId) {
    throw new HTTPException(400, {
      message: `${ACTOR_ID_HEADER} must not be sent when ${ACTOR_KIND_HEADER} is anonymous`,
    });
  }

  return { externalOrganizationId, externalActorId, actorKind: actorKindRaw };
};
