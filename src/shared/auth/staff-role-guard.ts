import { getStaffRoles, isVerifiedStaffUser } from '@/shared/auth/permissions';

export interface StaffGrantCheckInput {
  requestedRoles: string[];
  caller: { role?: string | null } | null;
  target: { role?: string | null; email: string; emailVerified: boolean } | null;
  staffDomain: string;
}

export type StaffGrantCheckResult = { allowed: true } | { allowed: false; reason: string };

export const checkStaffRoleGrant = (input: StaffGrantCheckInput): StaffGrantCheckResult => {
  const requestedStaff = getStaffRoles(input.requestedRoles.join(','));
  const targetStaff = getStaffRoles(input.target?.role);

  if (requestedStaff.length === 0 && targetStaff.length === 0) {
    return { allowed: true };
  }

  if (!getStaffRoles(input.caller?.role).includes('super_admin')) {
    return { allowed: false, reason: 'Only super admins can change staff roles' };
  }

  if (requestedStaff.length > 0) {
    if (!input.target) {
      return { allowed: false, reason: 'Target user not found' };
    }

    if (!isVerifiedStaffUser(input.target, input.staffDomain)) {
      return { allowed: false, reason: 'Staff roles are restricted to verified staff accounts' };
    }
  }

  return { allowed: true };
};
