import { BaseEvent } from '@/shared/events/event';

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE ACCOUNT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class StripeConnectedAccountCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.connected_account_created' as const;
}

export class StripeConnectedAccountUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.connected_account_updated' as const;
}

export class StripeConnectedAccountDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.connected_account_deleted' as const;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE CUSTOMER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class StripeCustomerCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.created' as const;
}

export class StripeCustomerUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.updated' as const;
}

export class StripeCustomerDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.deleted' as const;
}

export class StripeCustomerSyncFailed extends BaseEvent<Record<string, unknown>> {
  static type = 'stripe.customer.sync_failed' as const;
}
