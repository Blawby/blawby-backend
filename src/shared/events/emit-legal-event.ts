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
  // Deferred so a synchronous throw inside dispatch (before it returns) becomes a rejection instead of throwing out of this call — this function is typed Promise<string>, so callers using .catch()-style handling must never see a sync throw.
  return Promise.resolve().then(() => event.dispatch(payload, dispatchOptions));
};
