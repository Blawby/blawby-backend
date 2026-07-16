import type { ForcedSubject, MongoAbility, MongoQuery } from '@casl/ability';

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
  | 'Notification'
  | 'Invoice'
  | 'Payout'
  | 'RefundRequest'
  | 'Client'
  | 'ClientMemo'
  | 'MemberProfile'
  | 'ClientIntakeProfile';

/**
 * Subjects include both string names and tagged instances (from subject() helper).
 * The instance side is distributed per subject name so CASL can resolve the
 * instance (and therefore conditions) type for a specific subject.
 */
type Subject =
  | SubjectName
  | {
      [N in Exclude<SubjectName, 'all'>]: Record<string, unknown> & ForcedSubject<N>;
    }[Exclude<SubjectName, 'all'>];

/**
 * The application-wide Ability type. Conditions are keyed by arbitrary subject
 * fields because subjects are tagged plain records, not class instances.
 */
type AppAbility = MongoAbility<[Action, Subject], MongoQuery<Record<string, unknown>>>;

export type { Action, AppAbility, Subject, SubjectName };
