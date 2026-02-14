import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class UserDetailsCreated extends BaseEvent<{
  user_detail_id: string;
  user_id: string;
  name: string;
  email: string;
  stripe_customer_id?: string;
}> {
  static type = 'user_details.created' as const;
}

export class UserDetailsUpdated extends BaseEvent<{
  user_detail_id: string;
  changes?: Record<string, unknown>;
}> {
  static type = 'user_details.updated' as const;
}

export class UserDetailsDeleted extends BaseEvent<{
  user_detail_id: string;
}> {
  static type = 'user_details.deleted' as const;
}

export class UserDetailsStatusChanged extends BaseEvent<{
  user_detail_id: string;
  old_status: string;
  new_status: string;
}> {
  static type = 'user_details.status_changed' as const;
}
