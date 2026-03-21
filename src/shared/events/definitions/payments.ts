import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class PaymentSessionCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'payment.session_created' as const;
}

export class PaymentReceived extends BaseEvent<Record<string, unknown>> {
  static type = 'payment.received' as const;
}

export class PaymentSucceeded extends BaseEvent<{
  stripe_payment_intent_id: string;
  amount: number;
  currency?: string;
}> {
  static type = 'payment.succeeded' as const;
}

export class PaymentFailed extends BaseEvent<{
  stripe_payment_intent_id: string;
  error?: string;
}> {
  static type = 'payment.failed' as const;
}

export class PaymentCanceled extends BaseEvent<{
  stripe_payment_intent_id: string;
}> {
  static type = 'payment.canceled' as const;
}

export class PaymentRefunded extends BaseEvent<Record<string, unknown>> {
  static type = 'payment.refunded' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTAKE PAYMENT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class IntakePaymentCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'intake_payment.created' as const;
}

export class IntakePaymentSucceeded extends BaseEvent<{
  event_id?: string;
  organization_id: string;
  stripe_payment_intent_id: string;
  intake_payment_id: string;
  uuid: string;
  amount: number;
  currency: string;
  client_email?: string;
  client_name?: string;
  user_id?: string;
  stripe_charge_id?: string;
  succeeded_at: string;
}> {
  static type = 'intake_payment.succeeded' as const;
}

export class IntakePaymentFailed extends BaseEvent<{
  stripe_payment_intent_id: string;
  intake_payment_id: string;
  error?: string;
}> {
  static type = 'intake_payment.failed' as const;
}

export class IntakePaymentCanceled extends BaseEvent<{
  stripe_payment_intent_id: string;
  intake_payment_id: string;
}> {
  static type = 'intake_payment.canceled' as const;
}
