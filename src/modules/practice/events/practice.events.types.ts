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
export const isPaymentPayload = (payload: unknown): payload is PaymentEventPayload => {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.customer === 'object'
    && typeof p.payment === 'object'
    && typeof p.business === 'object'
  );
};
