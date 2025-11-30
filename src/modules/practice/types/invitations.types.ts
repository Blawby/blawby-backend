export type InvitationRole = 'owner' | 'admin' | 'attorney' | 'paralegal' | 'member';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

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

/**
 * Type guard to check if a string is a valid InvitationRole
 */
export const isValidInvitationRole = (role: unknown): role is InvitationRole => {
  return typeof role === 'string' && ['owner', 'admin', 'attorney', 'paralegal', 'member'].includes(role);
};

/**
 * Type guard to check if a string is a valid InvitationStatus
 */
export const isValidInvitationStatus = (status: unknown): status is InvitationStatus => {
  return typeof status === 'string' && ['pending', 'accepted', 'declined'].includes(status);
};

