import { BaseEvent } from '@/shared/events/event';

// ═══════════════════════════════════════════════════════════════════════════
// USER CRUD EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class UserCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.created' as const;
}

export class UserUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.updated' as const;
}

export class UserDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'user.deleted' as const;
}

export class UserProfileUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.profile_updated' as const;
}

export class UserEmailChanged extends BaseEvent<Record<string, unknown>> {
  static type = 'user.email_changed' as const;
}

export class UserAvatarUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'user.avatar_updated' as const;
}
