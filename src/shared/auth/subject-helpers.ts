/**
 * Subject Helpers
 *
 * Type-safe utilities for bridging strongly-typed domain objects
 * to CASL's `subject()` helper which requires Record<string, unknown>.
 */

import { subject } from '@casl/ability';
import type { SubjectName } from '@/shared/auth/abilities';

/**
 * Type-safe wrapper around CASL's `subject()` that accepts any object type.
 *
 * CASL's `subject(type, obj)` requires `obj` to be `Record<string, unknown>`,
 * but strongly-typed domain objects (e.g. from Drizzle) don't carry an index
 * signature.  This helper keeps the cast in one place so service code stays
 * clean.
 */
export function toSubject<T extends Exclude<SubjectName, 'all'>>(
  type: T,
  obj: object,
) {
  return subject(type, obj as Record<string, unknown>);
}
