/**
 * Payments Module Types
 *
 * Type definitions for payment intent operations and service responses
 */

import type { SelectPaymentIntent } from '@/modules/payments/database/schema/payment-intents.schema';

// Payment Intent Status
export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded';

// Generic Service Response
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Create Payment Intent
export interface CreatePaymentIntentRequest {
  organizationId: string;
  customerId?: string;
  amount: number; // in cents
  currency?: string;
  applicationFeeAmount?: number; // in cents
  paymentMethodTypes?: string[];
  customerEmail?: string;
  customerName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentIntentResponse extends ServiceResponse<{
  id: string;
  stripePaymentIntentId: string;
  clientSecret: string;
  amount: number;
  status: string;
}> {
  paymentIntent?: CreatePaymentIntentResponse['data'];
}

// Confirm Payment
export interface ConfirmPaymentRequest {
  paymentIntentId: string;
  organizationId: string;
  paymentMethodId?: string;
}

export interface ConfirmPaymentResponse extends ServiceResponse<{
  id: string;
  status: string;
  chargeId?: string;
}> {
  paymentIntent?: ConfirmPaymentResponse['data'];
}

// Payment Intent Ownership Verification
export interface PaymentIntentOwnershipResult {
  success: boolean;
  paymentIntent?: SelectPaymentIntent;
  connectedAccount?: {
    id: string;
    stripe_account_id: string;
    organization_id: string;
  };
  error?: string;
}
