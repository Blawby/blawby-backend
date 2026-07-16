import { AsyncLocalStorage } from 'node:async_hooks';

interface IntakeAcceptedMagicLinkContext {
  kind: 'intake_accepted';
  practiceName: string;
  recipientName: string;
}

const deliveryContext = new AsyncLocalStorage<IntakeAcceptedMagicLinkContext>();

export const withMagicLinkDeliveryContext = async <T>(
  context: IntakeAcceptedMagicLinkContext,
  operation: () => Promise<T>
): Promise<T> => deliveryContext.run(context, operation);

export const getMagicLinkDeliveryContext = (): IntakeAcceptedMagicLinkContext | undefined => deliveryContext.getStore();
