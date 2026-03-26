import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class ClientCreated extends BaseEvent<{
  client_id: string;
  user_id?: string;
  name?: string;
  email?: string;
  stripe_customer_id?: string;
}> {
  static type = 'client.created' as const;
}

export class ClientUpdated extends BaseEvent<{
  client_id: string;
  changes?: Record<string, unknown>;
}> {
  static type = 'client.updated' as const;
}

export class ClientDeleted extends BaseEvent<{
  client_id: string;
}> {
  static type = 'client.deleted' as const;
}

export class ClientStatusChanged extends BaseEvent<{
  client_id: string;
  old_status: string;
  new_status: string;
}> {
  static type = 'client.status_changed' as const;
}
