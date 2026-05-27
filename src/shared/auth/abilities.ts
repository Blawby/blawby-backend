import { AbilityBuilder, createMongoAbility, type ForcedSubject, type MongoAbility } from '@casl/ability';
import { OrgRole, ADMIN_ROLES, MEMBER_ROLES } from '@/shared/enums/org-roles';

/**
 * Actions that can be performed on resources
 */
export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

/**
 * Subject names (resources) in the system
 */
export type SubjectName =
  | 'all'
  | 'OrganizationPreferences'
  | 'UserPreferences'
  | 'UserDetails'
  | 'PracticeClientIntake'
  | 'Upload'
  | 'Trust'
  | 'User'
  | 'Organization'
  | 'Onboarding'
  | 'Subscription'
  | 'Matter'
  | 'Invoice'
  | 'RefundRequest'
  | 'Client'
  | 'ClientMemo'
  | 'ClientIntakeProfile';

/**
 * Subjects include both string names and tagged instances (from subject() helper)
 */
export type Subject = SubjectName | (Record<string, unknown> & ForcedSubject<Exclude<SubjectName, 'all'>>);

/**
 * The application-wide Ability type
 */
export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * Define abilities based on user role and context
 *
 * @param role - The current user's role in the organization
 * @param metadata - Additional context (userId, organizationId, etc.)
 */
export const defineAbilityFor = (
  role: string | null,
  metadata: { userId?: string; organizationId?: string } = {}
): AppAbility => {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  const canWithConditions = can as (action: Action, subject: SubjectName, conditions: Record<string, unknown>) => void;

  const orgRole = role ?? null;

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
    can('update', 'PracticeClientIntake');
    can('read', 'Invoice');
    can('update', 'Invoice');
    can('read', 'Subscription');
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

  return build();
};
