import type { DispatchOptions, EventClass } from '@/shared/events/types/event.types';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

export const emitLegalEvent = <T extends Record<string, unknown>>(
  ctx: LegalOperationContext,
  event: EventClass<T>,
  payload: T,
  options: Omit<DispatchOptions, 'actorId' | 'organizationId'> = {}
): Promise<string> => {
  const dispatchOptions: DispatchOptions = {
    ...options,
    actorId: ctx.userId ?? 'system',
    organizationId: ctx.organizationId,
  };
  const result = event.dispatch(payload, dispatchOptions);
  return result instanceof Promise ? result : Promise.resolve(result);
};
