import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export type PracticeCreatedPayload = {
  organization_id: string;
  name: string;
  organization_name: string;
  organization_slug: string;
  has_practice_details: boolean;
  practice_details_id?: string;
  user_email?: string;
};

export class PracticeCreated extends BaseEvent<PracticeCreatedPayload> {
  static type = 'practice.created' as const;
}

export type PracticeUpdatedPayload = {
  organization_id: string;
  name?: string;
  organization_name?: string;
  organization_slug?: string;
  has_practice_details?: boolean;
  practice_details_id?: string;
  user_email?: string;
  update_type?: string;
  updated_at?: string;
};

export class PracticeUpdated extends BaseEvent<PracticeUpdatedPayload> {
  static type = 'practice.updated' as const;
}

export type PracticeDeletedPayload = {
  organization_id: string;
  had_practice_details: boolean;
  practice_details_id?: string;
  user_email?: string;
};

export class PracticeDeleted extends BaseEvent<PracticeDeletedPayload> {
  static type = 'practice.deleted' as const;
}

export type PracticeDetailsUpsertedPayload = {
  practice_details_id: string;
  business_phone?: string | null | undefined;
  business_email?: string | null | undefined;
  consultation_fee?: number | null | undefined;
  payment_url?: string | null | undefined;
  calendly_url?: string | null | undefined;
  website?: string | null | undefined;
  intro_message?: string | null | undefined;
  overview?: string | null | undefined;
  accent_color?: string | null | undefined;
  is_public?: boolean | undefined;
  billing_increment_minutes?: number | undefined;
  services?: Array<{ id?: string | undefined; name: string; key: string }> | undefined;
  address?: {
    line1?: string | null | undefined;
    line2?: string | null | undefined;
    city?: string | null | undefined;
    state?: string | null | undefined;
    postal_code?: string | null | undefined;
    country?: string | null | undefined;
  } | undefined;
};

export class PracticeDetailsCreated extends BaseEvent<PracticeDetailsUpsertedPayload> {
  static type = 'practice.details_created' as const;
}

export class PracticeDetailsUpdated extends BaseEvent<PracticeDetailsUpsertedPayload> {
  static type = 'practice.details_updated' as const;
}

export type PracticeDetailsDeletedPayload = {
  practice_details_id: string;
  business_phone: string | null;
  business_email: string | null;
  consultation_fee: number | null;
  payment_url: string | null;
  calendly_url: string | null;
};

export class PracticeDetailsDeleted extends BaseEvent<PracticeDetailsDeletedPayload> {
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

export type PracticeSwitchedPayload = {
  user_id: string;
  to_organization_id: string;
  user_email?: string;
  switched_to_organization?: string;
};

export class PracticeSwitched extends BaseEvent<PracticeSwitchedPayload> {
  static type = 'practice.switched' as const;
}

export class PracticeAccessDenied extends BaseEvent<{
  user_id: string;
  organization_id: string;
  reason: string;
}> {
  static type = 'practice.access_denied' as const;
}
