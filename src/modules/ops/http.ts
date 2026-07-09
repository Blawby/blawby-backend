import { HTTPException } from 'hono/http-exception';
import { getOpsResource } from '@/modules/ops/resources';
import type { OpsListParams } from '@/modules/ops/types';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireAuth, requirePermission } from '@/shared/middleware/auth';
import { createHonoApp } from '@/shared/router/factory';

const opsApp = createHonoApp();

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getListParams = (query: Record<string, string>): OpsListParams => {
  const limit = Math.min(parsePositiveInteger(query.limit, DEFAULT_LIMIT), MAX_LIMIT);

  return {
    limit,
    offset: parsePositiveInteger(query.offset, 0),
    q: query.q?.trim() ? query.q.trim() : null,
    status: query.status?.trim() ? query.status.trim() : null,
  };
};

opsApp.use('*', requireAuth(), injectAbility(), requirePermission('read', 'InternalConsole'));

opsApp.get('/:resource', async (c) => {
  const resource = getOpsResource(c.req.param('resource'));

  if (!resource) {
    throw new HTTPException(404, { message: 'Ops resource not found' });
  }

  const result = await resource.list(getListParams(c.req.query()));
  return c.json(result);
});

opsApp.get('/:resource/:id/:relation', async (c) => {
  const resource = getOpsResource(c.req.param('resource'));

  if (!resource) {
    throw new HTTPException(404, { message: 'Ops resource not found' });
  }

  const relation = resource.relations?.[c.req.param('relation')];

  if (!relation) {
    throw new HTTPException(404, { message: 'Ops relation not found' });
  }

  const result = await relation.list(c.req.param('id'), getListParams(c.req.query()));
  return c.json(result);
});

opsApp.get('/:resource/:id', async (c) => {
  const resource = getOpsResource(c.req.param('resource'));

  if (!resource) {
    throw new HTTPException(404, { message: 'Ops resource not found' });
  }

  const data = await resource.get(c.req.param('id'));

  if (!data) {
    throw new HTTPException(404, { message: 'Ops record not found' });
  }

  return c.json({ data });
});

export default opsApp;
