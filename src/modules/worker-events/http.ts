/**
 * Worker Events HTTP Module
 *
 * Internal endpoint for external workers to dispatch events
 * into the backend event/listener pipeline.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppContext } from '@/shared/types/hono';
import { ingestRoute } from '@/modules/worker-events/routes';
import { ingestHandler } from '@/modules/worker-events/handlers';

const workerEventsApp = new OpenAPIHono<AppContext>();

workerEventsApp.openapi(ingestRoute, ingestHandler);

export default workerEventsApp;
