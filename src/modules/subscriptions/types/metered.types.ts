/**
 * Metered Billing Type Definitions
 */

/**
 * Metered product configuration
 */
export type MeteredProduct = {
  priceId: string;
  meterName: string;
  itemType: string;
  description: string;
  enabled: boolean;
};

/**
 * Usage record for reporting to Stripe
 */
export type UsageRecord = {
  organizationId: string;
  meterName: string;
  quantity: number;
  timestamp?: number;
};

/**
 * Current usage summary
 */
export type UsageSummary = {
  meterName: string;
  quantity: number;
  description: string | null;
};

/**
 * Metered product attachment result
 */
export type AttachmentResult = {
  subscriptionItemId: string;
  wasAlreadyAttached: boolean;
};




