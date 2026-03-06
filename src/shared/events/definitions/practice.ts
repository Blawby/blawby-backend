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
  business_phone?: string | null;
  business_email?: string | null;
  consultation_fee?: number | null;
  payment_url?: string | null;
  calendly_url?: string | null;
  website?: string | null;
  intro_message?: string | null;
  overview?: string | null;
  accent_color?: string | null;
  is_public?: boolean;
  billing_increment_minutes?: number;
  services?: Array<{ id?: string; name: string; key: string }>;
  supported_states?: Array<{ country: string; states?: string[] }>;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  };
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

export type PracticeMemberInvitedPayload = {
  invitation_id: string;
  invited_email: string;
  role: string;
  organization_id: string;
  inviter_id: string;
};

export class PracticeMemberInvited extends BaseEvent<PracticeMemberInvitedPayload> {
  static type = 'practice.member_invited' as const;
}

export type PracticeMemberJoinedPayload = {
  member_id: string;
  intake_id: string;
};

export class PracticeMemberJoined extends BaseEvent<PracticeMemberJoinedPayload> {
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
