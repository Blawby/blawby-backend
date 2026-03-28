import type { z } from '@hono/zod-openapi';
import type { workerEventsValidation } from '@/modules/worker-events/validations/worker-events.validation';

export type WorkerEventPayload = z.infer<typeof workerEventsValidation.payloadSchema>;
export type WorkerEventResponse = z.infer<typeof workerEventsValidation.responseSchema>;
