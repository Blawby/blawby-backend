/**
 * Practice Event Type Definitions
 */

export interface PaymentEventPayload {
  customer: {
    email: string;
    name: string;
  };
  payment: {
    invoiceNumber: string;
    amount: number;
    method: string;
    id: string;
    amountRefunded?: number;
  };
  items: unknown[];
  business: {
    name: string;
    logoUrl?: string;
    supportEmail: string;
    ownerEmail?: string;
    ownerName?: string;
  };
}

/**
 * Type guard for PaymentEventPayload
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const isPaymentPayload = (payload: unknown): payload is PaymentEventPayload => {
  if (!isRecord(payload)) {return false;}
  if (!('customer' in payload) || !('payment' in payload) || !('business' in payload)) {return false;}

  return isRecord(payload.customer) && isRecord(payload.payment) && isRecord(payload.business);
};
