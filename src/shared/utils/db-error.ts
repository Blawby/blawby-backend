import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['shared', 'utils', 'db-error']);

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_SERIALIZATION_FAILURE = '40001';

/**
 * Normalise a caught Drizzle/pg error into the project's throw-based error convention.
 * - Unique violation (23505) → 409 Conflict
 * - Foreign key violation (23503) → 400 Bad Request
 * - Serialization failure (40001) → 500 Error (Graphile Worker will retry)
 * - All others → 500 Error
 *
 * Usage: catch (err) { wrapDbError(err); }
 */
export const wrapDbError = (err: unknown): never => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code;
    if (code === PG_UNIQUE_VIOLATION) {
      logger.warn('Database unique violation: {code}', { code });
      throw new HTTPException(409, { message: 'Resource already exists' });
    }
    if (code === PG_FOREIGN_KEY_VIOLATION) {
      logger.warn('Database foreign key violation: {code}', { code });
      throw new HTTPException(400, { message: 'Invalid reference — related resource not found' });
    }
    if (code === PG_SERIALIZATION_FAILURE) {
      logger.error('Database serialization failure: {code}', { code });
      throw new Error('Database serialization failure — retry');
    }
  }
  const message = err instanceof Error ? err.message : 'Unknown database error';
  logger.error('Unknown database error: {message}', { message });
  throw new Error(message);
};
