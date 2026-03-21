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
  | 'PracticeClientIntake'
  | 'User'
  | 'Organization'
  | 'Matter'
  | 'Invoice'
  | 'UserDetails'
  | 'ClientMemo';

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
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // Cast role to OrgRole for simpler checks
  const orgRole = role as OrgRole | null;

  // Global admin fallback
  if (orgRole && (ADMIN_ROLES as readonly string[]).includes(orgRole)) {
    can('manage', 'all');
  } else if (orgRole && (MEMBER_ROLES as readonly string[]).includes(orgRole)) {
    // Member roles have broad read access but restricted manage access
    can('read', 'all');
    can('update', 'OrganizationPreferences');
    can('update', 'Matter');
    can('update', 'PracticeClientIntake');
    can('read', 'Invoice');
    can('update', 'Invoice');
    can('manage', 'UserDetails');
    can('manage', 'ClientMemo');
  } else if (orgRole === OrgRole.CLIENT) {
    // Clients have restricted permissions
    can('read', 'Organization');
    // They can manage their own intake data
    if (metadata.userId) {
      const canWithConditions = can as unknown as (action: Action, subject: SubjectName, conditions: unknown) => void;
      canWithConditions('manage', 'PracticeClientIntake', { userId: metadata.userId });
      canWithConditions('read', 'UserDetails', { user_id: metadata.userId });
      canWithConditions('update', 'UserDetails', { user_id: metadata.userId });
      canWithConditions('read', 'ClientMemo', { client_user_id: metadata.userId });
    }
  }

  return build();
};
