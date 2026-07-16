import type { ForcedSubject, MongoAbility } from '@casl/ability';

/**
 * Actions that can be performed on resources
 */
type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

/**
 * Subject names (resources) in the system
 */
type SubjectName =
  | 'all'
  | 'InternalConsole'
  | 'AuditLog'
  | 'DataExport'
  | 'OrganizationPreferences'
  | 'UserPreferences'
  | 'UserDetails'
  | 'PracticeClientIntake'
  | 'IntakeTemplate'
  | 'Upload'
  | 'Trust'
  | 'User'
  | 'Organization'
  | 'Onboarding'
  | 'Subscription'
  | 'Matter'
  | 'IntakeConversation'
  | 'Invoice'
  | 'Payout'
  | 'RefundRequest'
  | 'Client'
  | 'ClientMemo'
  | 'MemberProfile'
  | 'ClientIntakeProfile';

/**
 * Subjects include both string names and tagged instances (from subject() helper)
 */
type Subject = SubjectName | (Record<string, unknown> & ForcedSubject<Exclude<SubjectName, 'all'>>);

/**
 * The application-wide Ability type
 */
type AppAbility = MongoAbility<[Action, Subject]>;

export type { Action, AppAbility, Subject, SubjectName };
