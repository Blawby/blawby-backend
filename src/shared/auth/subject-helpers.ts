/**
 * Subject Helpers
 *
 * Type-safe utilities for bridging strongly-typed domain objects to CASL's `subject()` helper.
 */

import type { Subject, SubjectName } from '@/shared/auth/abilities.types';
import { subject } from '@casl/ability';

/**
 * Type-safe wrapper around CASL's `subject()` that accepts any object type.
 *
 * CASL's `subject(type, obj)` requires a record-shaped object, but strongly-typed
 * domain objects from Drizzle don't carry an index signature. This helper creates
 * a shallow record copy so service code can pass domain objects directly.
 *
 * It returns the `Subject` union type to ensure compatibility with the system's
 * ability definitions without requiring inline casting in service calls.
 */
export const toSubject = (type: Exclude<SubjectName, 'all'>, obj: object): Subject => {
  const subjectObject: Record<PropertyKey, unknown> = { ...obj };

  return subject(type, subjectObject);
};
