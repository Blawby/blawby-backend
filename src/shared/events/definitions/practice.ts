import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class PracticeCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.created' as const;
}

export class PracticeUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.updated' as const;
}

export class PracticeDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.deleted' as const;
}

export class PracticeDetailsCreated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.details_created' as const;
}

export class PracticeDetailsUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.details_updated' as const;
}

export class PracticeDetailsDeleted extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.details_deleted' as const;
}

export class PracticeSpecialtiesUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.specialties_updated' as const;
}

export class PracticeContactInfoUpdated extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.contact_info_updated' as const;
}

export class PracticeMemberInvited extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_invited' as const;
}

export class PracticeMemberJoined extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_joined' as const;
}

export class PracticeMemberRoleChanged extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_role_changed' as const;
}

export class PracticeMemberRemoved extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_removed' as const;
}

export class PracticeMemberLeft extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.member_left' as const;
}

export class PracticeSwitched extends BaseEvent<Record<string, unknown>> {
  static type = 'practice.switched' as const;
}

export class PracticeAccessDenied extends BaseEvent<{
  user_id: string;
  organization_id: string;
  reason: string;
}> {
  static type = 'practice.access_denied' as const;
}
