import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['shared', 'utils', 'db-error']);

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_SERIALIZATION_FAILURE = '40001';

interface PgErrorInfo {
  code?: string;
  constraint?: string;
  detail?: string;
  schema?: string;
  table?: string;
  column?: string;
  message?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const extractPgErrorInfo = (err: unknown): PgErrorInfo => {
  const sources = [err];
  if (isRecord(err) && 'cause' in err) {
    sources.push(err.cause);
  }

  for (const source of sources) {
    if (isRecord(source)) {
      const code = readString(source.code);
      if (code) {
        return {
          code,
          constraint: readString(source.constraint),
          detail: readString(source.detail),
          schema: readString(source.schema),
          table: readString(source.table),
          column: readString(source.column),
          message: source instanceof Error ? source.message : readString(source.message),
        };
      }
    }
  }

  return {
    message: err instanceof Error ? err.message : 'Unknown database error',
  };
};

const toLogAttrs = (pgError: PgErrorInfo): Record<string, unknown> => ({
  code: pgError.code,
  constraint: pgError.constraint,
  detail: pgError.detail,
  schema: pgError.schema,
  table: pgError.table,
  column: pgError.column,
  message: pgError.message,
});

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
  const pgError = extractPgErrorInfo(err);
  const logAttrs = toLogAttrs(pgError);

  if (pgError.code === PG_UNIQUE_VIOLATION) {
    logger.warn('Database unique violation: {code} {constraint}', logAttrs);
    throw new HTTPException(409, { message: 'Resource already exists' });
  }
  if (pgError.code === PG_FOREIGN_KEY_VIOLATION) {
    logger.warn('Database foreign key violation: {code} {constraint}', logAttrs);
    throw new HTTPException(400, { message: 'Invalid reference — related resource not found' });
  }
  if (pgError.code === PG_SERIALIZATION_FAILURE) {
    logger.error('Database serialization failure: {code}', logAttrs);
    throw new Error('Database serialization failure — retry');
  }

  const message = pgError.message ?? 'Unknown database error';
  logger.error('Unknown database error: {message}', { ...logAttrs, message });
  throw new Error(message);
};
