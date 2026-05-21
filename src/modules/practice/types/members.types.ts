export type MemberRole = 'owner' | 'admin' | 'attorney' | 'paralegal' | 'member' | 'client';

export interface MemberListItem {
  user_id: string;
  email: string;
  name: string | null;
  role: MemberRole;
  joined_at: number;
}

/**
 * Type guard to check if a string is a valid MemberRole
 */
export const isValidMemberRole = (role: unknown): role is MemberRole =>
  typeof role === 'string' && ['owner', 'admin', 'attorney', 'paralegal', 'member', 'client'].includes(role);
