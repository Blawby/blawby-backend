/**
 * Worker Events HTTP Module
 *
 * Internal endpoint for external workers to dispatch events
 * into the backend event/listener pipeline.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { ingestRoute, ingestIntakeConversationsRoute } from '@/modules/worker-events/routes';
import { ingestHandler, ingestIntakeConversationsHandler } from '@/modules/worker-events/handlers';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '@/shared/types/hono';

const workerEventsApp = new OpenAPIHono<AppContext>();
workerEventsApp.use('*', injectAbility());
workerEventsApp.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization');
  const key = authHeader ? /^bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim() : undefined;
  if (!key) {
    throw new HTTPException(401, { message: 'Missing API key' });
  }
  const { valid } = await createBetterAuthInstance(db).api.verifyApiKey({ body: { key } });
  if (!valid) {
    throw new HTTPException(401, { message: 'Invalid API key' });
  }
  await next();
});

workerEventsApp.openapi(ingestRoute, ingestHandler);
workerEventsApp.openapi(ingestIntakeConversationsRoute, ingestIntakeConversationsHandler);

export default workerEventsApp;
