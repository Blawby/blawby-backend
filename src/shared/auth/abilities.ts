import type { Action, AppAbility, SubjectName } from '@/shared/auth/abilities.types';
import { getStaffRoles, type StaffRole } from '@/shared/auth/permissions';
import { ADMIN_ROLES, MEMBER_ROLES, OrgRole } from '@/shared/enums/org-roles';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

const STAFF_CONSOLE_GRANTS: Record<StaffRole, Action[]> = {
  support: ['read'],
  ops: ['read'],
  super_admin: ['manage'],
};

/**
 * Define abilities based on user role and context
 *
 * @param role - The current user's role in the organization
 * @param metadata - Additional context (userId, organizationId, etc.)
 */
const defineAbilityFor = (
  role: string | null,
  metadata: { userId?: string; organizationId?: string; globalRole?: string | null; isVerifiedStaff?: boolean } = {}
): AppAbility => {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  const canWithConditions = can as (action: Action, subject: SubjectName, conditions: Record<string, unknown>) => void;

  const orgRole = role ?? null;
  const staffRoles = metadata.isVerifiedStaff ? getStaffRoles(metadata.globalRole) : [];

  // User-scoped preferences: authenticated users can only read/update their own row.
  if (metadata.userId) {
    canWithConditions('read', 'UserPreferences', { user_id: metadata.userId });
    canWithConditions('update', 'UserPreferences', { user_id: metadata.userId });
  }

  // Global admin fallback
  if (orgRole && (ADMIN_ROLES as readonly string[]).includes(orgRole)) {
    can('manage', 'all');
  } else if (orgRole && (MEMBER_ROLES as readonly string[]).includes(orgRole)) {
    // Member roles have broad read access with explicit restrictions for select subjects
    can('read', 'all');
    can('create', 'Upload');
    can('read', 'Upload');
    cannot('update', 'Upload');
    cannot('delete', 'Upload');
    can('update', 'Matter');
    can('read', 'IntakeConversation');
    can('update', 'IntakeConversation');
    can('update', 'PracticeClientIntake');
    can('read', 'Invoice');
    can('update', 'Invoice');
    can('read', 'Payout');
    can('read', 'Subscription');
    cannot('read', 'AuditLog');
    can('read', 'Trust');
    can('read', 'RefundRequest');
    can('update', 'RefundRequest');
    can('manage', 'Client');
    can('manage', 'ClientMemo');
    can('manage', 'ClientIntakeProfile');
    cannot('read', 'UserDetails');
    if (metadata.userId) {
      canWithConditions('read', 'UserDetails', { user_id: metadata.userId });
    }
  } else if (orgRole === OrgRole.CLIENT) {
    // Clients have restricted permissions
    can('read', 'Organization');
    // They can manage their own intake data
    if (metadata.userId) {
      canWithConditions('manage', 'PracticeClientIntake', { userId: metadata.userId });
      canWithConditions('read', 'Client', { user_id: metadata.userId });
      canWithConditions('update', 'Client', { user_id: metadata.userId });
      canWithConditions('read', 'ClientMemo', { client_user_id: metadata.userId });
      can('create', 'RefundRequest');
      can('read', 'RefundRequest');
      can('update', 'RefundRequest');
      canWithConditions('read', 'Invoice', { client_user_id: metadata.userId });
      canWithConditions('read', 'Upload', { user_id: metadata.userId });
      canWithConditions('read', 'UserDetails', { user_id: metadata.userId });
    }
  }

  if (orgRole) {
    cannot('read', 'InternalConsole');
    cannot('manage', 'InternalConsole');
  }

  for (const staffRole of staffRoles) {
    for (const action of STAFF_CONSOLE_GRANTS[staffRole]) {
      can(action, 'InternalConsole');
    }
  }

  return build();
};

export { defineAbilityFor };
