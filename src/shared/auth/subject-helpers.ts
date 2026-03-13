/**
 * Subject Helpers
 *
 * Type-safe utilities for bridging strongly-typed domain objects
 * to CASL's `subject()` helper which requires Record<string, unknown>.
 */

import { subject } from '@casl/ability';
import type { SubjectName, Subject } from '@/shared/auth/abilities';

/**
 * Type-safe wrapper around CASL's `subject()` that accepts any object type.
 *
 * CASL's `subject(type, obj)` requires `obj` to be `Record<string, unknown>`,
 * but strongly-typed domain objects (e.g. from Drizzle) don't carry an index
 * signature.  This helper keeps the cast in one place so service code stays
 * clean.
 *
 * It returns the `Subject` union type to ensure compatibility with the system's
 * ability definitions without requiring inline casting in service calls.
 */
export function toSubject<T extends Exclude<SubjectName, 'all'>>(
  type: T,
  obj: object,
): Subject {
  return subject(type, obj as Record<string, unknown>) as Subject;
}
