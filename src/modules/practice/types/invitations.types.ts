import type { Invitation as BetterAuthInvitation } from '@/shared/types/BetterAuth';

// Use Better Auth's role type (validated by Better Auth)
export type InvitationRole = BetterAuthInvitation['role'];

// Use Better Auth's status type (includes 'pending', 'accepted', 'declined', 'rejected')
export type InvitationStatus = BetterAuthInvitation['status'];

export type InvitationListItem = {
  id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  role: InvitationRole | null;
  status: InvitationStatus;
  expires_at: number;
  created_at: number;
};

