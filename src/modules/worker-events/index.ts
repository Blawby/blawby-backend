/**
 * Worker Events Module
 *
 * Internal ingestion surface for worker-originated events.
 * Accepts canonical worker event payloads and dispatches them
 * into the backend event/listener pipeline.
 */

import workerEventsApp from '@/modules/worker-events/http';

export default workerEventsApp;
