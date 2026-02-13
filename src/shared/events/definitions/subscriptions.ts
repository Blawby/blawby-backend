import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class SubscriptionCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.created' as const;
}

export class SubscriptionUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.updated' as const;
}

export class SubscriptionCancelled extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.cancelled' as const;
}

export class SubscriptionRenewed extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.renewed' as const;
}

export class SubscriptionPaymentFailed extends BaseEvent<Record<string, unknown>> {
  static type = 'subscription.payment_failed' as const;
}
