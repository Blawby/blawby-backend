import { BaseEvent } from '../event';

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export class AuthUserSignedUp extends BaseEvent<{
  actor_id: string;
  user_id: string;
  email: string;
  name: string | null;
  signup_method: string;
  is_anonymous: boolean;
}> {
  static type = 'auth.user_signed_up' as const;
}

export class AuthEmailVerified extends BaseEvent<{
  user_id: string;
  email: string;
}> {
  static type = 'auth.email_verified' as const;
}

export class AuthUserLoggedIn extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'auth.user_logged_in' as const;
}

export class AuthUserLoggedOut extends BaseEvent<{
  user_id: string;
  session_id: string;
}> {
  static type = 'auth.user_logged_out' as const;
}

export class AuthPasswordResetRequested extends BaseEvent<{
  user_id: string;
  email: string;
}> {
  static type = 'auth.password_reset_requested' as const;
}

export class AuthPasswordChanged extends BaseEvent<{
  user_id: string;
}> {
  static type = 'auth.password_changed' as const;
}

export class AuthAccountDeleted extends BaseEvent<{
  user_id: string;
  email: string;
}> {
  static type = 'auth.account_deleted' as const;
}

export class InvitationAccepted extends BaseEvent<{
  invitationId: string;
  organizationId: string;
  userId: string;
  email: string;
  role: string;
}> {
  static type = 'auth.invitation_accepted' as const;
}
