import { BaseEvent } from '@/shared/events/event';

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class SettingsCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.created' as const;
}

export class SettingsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.updated' as const;
}

export class SettingsDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.deleted' as const;
}

export class UserSettingsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.user_updated' as const;
}

export class PracticeSettingsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.practice_updated' as const;
}

export class SettingsCategoryUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'settings.category_updated' as const;
}
