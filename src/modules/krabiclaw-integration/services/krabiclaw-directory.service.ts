import { isRetryableD1Error } from '@/modules/krabiclaw-integration/services/d1-error-classification';
import type {
  KrabiClawOrganizationDirectoryRecord,
  KrabiClawUserDirectoryRecord,
} from '@/modules/krabiclaw-integration/types/directory.types';
import {
  organizationDirectoryRowSchema,
  userDirectoryRowSchema,
} from '@/modules/krabiclaw-integration/validations/directory.validation';
import { config } from '@/shared/config';
import { getLogger } from '@logtape/logtape';
import Cloudflare, { APIError } from 'cloudflare';
import { createHash } from 'node:crypto';

const logger = getLogger(['modules', 'krabiclaw-integration', 'directory']);

const REQUEST_BUDGET_MS = 3000;

type D1Lookup = 'organization' | 'user';

interface D1RowMeta {
  rows_written?: number;
  changed_db?: boolean;
}

const getClient = (): Cloudflare => {
  const { d1ApiToken } = config.krabiclaw;
  if (!d1ApiToken) {
    throw new Error('CLOUDFLARE_D1_API_TOKEN is not configured');
  }
  return new Cloudflare({ apiToken: d1ApiToken, maxRetries: 0 });
};

const requireD1Config = (): { accountId: string; databaseId: string } => {
  const { d1AccountId, d1DatabaseId } = config.krabiclaw;
  if (!d1AccountId || !d1DatabaseId) {
    throw new Error('CLOUDFLARE_D1_ACCOUNT_ID and CLOUDFLARE_D1_DATABASE_ID must both be configured');
  }
  return { accountId: d1AccountId, databaseId: d1DatabaseId };
};

const assertNoUnexpectedWrite = (meta: D1RowMeta | undefined): void => {
  if (meta?.changed_db === true || (meta?.rows_written ?? 0) > 0) {
    throw new Error('D1 read-only query unexpectedly reported a write');
  }
};

/**
 * Never log a raw KrabiClaw external ID or the full Cloudflare API error payload
 * (message/stack/headers/response body) — only an allowlisted, hashed-ID summary.
 */
const hashExternalId = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);

/**
 * Callers must never receive the raw Cloudflare SDK error directly — it can
 * carry response headers/body that sanitizeD1Error deliberately keeps out of
 * our own log lines. Wrapping with a stable message keeps that guarantee at
 * the module boundary too, while `cause` still preserves the original for
 * anyone deliberately inspecting it (e.g. a debugger).
 */
const wrapD1Failure = (error: unknown, lookup: D1Lookup): Error =>
  new Error(`D1 ${lookup} lookup failed`, { cause: error });

const sanitizeD1Error = (error: unknown, lookup: D1Lookup, externalId: string): Record<string, unknown> => {
  const safe: Record<string, unknown> = { lookup, externalIdHash: hashExternalId(externalId) };
  if (error instanceof APIError) {
    safe.errorType = error.constructor.name;
    safe.status = error.status;
    return safe;
  }
  if (error instanceof Error) {
    safe.errorType = error.name;
    return safe;
  }
  safe.errorType = 'unknown';
  return safe;
};

const runFixedQuery = async (
  sql: string,
  params: string[],
  deadlineAt: number,
  logContext: { lookup: D1Lookup; externalId: string }
): Promise<unknown[]> => {
  const { accountId, databaseId } = requireD1Config();
  const client = getClient();

  const attempt = async (): Promise<unknown[]> => {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      throw new Error('D1 query exceeded its 3-second budget');
    }
    // Cloudflare SDK 7's `timeout` option only covers the wait for response
    // Headers — it clears its timer as soon as fetch() resolves, before the
    // Response body is parsed. An AbortSignal we control stays armed through
    // Body parsing too, so it's what actually enforces the full budget.
    const page = await client.d1.database.query(
      databaseId,
      { account_id: accountId, sql, params },
      { maxRetries: 0, signal: AbortSignal.timeout(remaining) }
    );
    const [queryResult] = page.result;
    if (!queryResult?.success) {
      throw new Error('D1 query did not report success');
    }
    assertNoUnexpectedWrite(queryResult.meta);
    return queryResult.results ?? [];
  };

  try {
    return await attempt();
  } catch (error) {
    if (!isRetryableD1Error(error) || Date.now() >= deadlineAt) {
      logger.error('krabiclaw D1 query failed: {error}', {
        error: sanitizeD1Error(error, logContext.lookup, logContext.externalId),
      });
      throw wrapD1Failure(error, logContext.lookup);
    }
    logger.warn('krabiclaw D1 query failed once, retrying within budget: {error}', {
      error: sanitizeD1Error(error, logContext.lookup, logContext.externalId),
    });
    try {
      return await attempt();
    } catch (retryError) {
      logger.error('krabiclaw D1 query failed after retry: {error}', {
        error: sanitizeD1Error(retryError, logContext.lookup, logContext.externalId),
      });
      throw wrapD1Failure(retryError, logContext.lookup);
    }
  }
};

const getOrganizationDirectoryRecord = async (
  organizationId: string
): Promise<KrabiClawOrganizationDirectoryRecord> => {
  const deadlineAt = Date.now() + REQUEST_BUDGET_MS;
  const rows = await runFixedQuery(
    'SELECT id, name, slug FROM organization WHERE id = ?',
    [organizationId],
    deadlineAt,
    { lookup: 'organization', externalId: organizationId }
  );
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one organization row, got ${rows.length}`);
  }
  return organizationDirectoryRowSchema.parse(rows[0]);
};

const getUserDirectoryRecord = async (userId: string): Promise<KrabiClawUserDirectoryRecord> => {
  const deadlineAt = Date.now() + REQUEST_BUDGET_MS;
  const rows = await runFixedQuery('SELECT id, name, email FROM user WHERE id = ?', [userId], deadlineAt, {
    lookup: 'user',
    externalId: userId,
  });
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one user row, got ${rows.length}`);
  }
  return userDirectoryRowSchema.parse(rows[0]);
};

export const krabiclawDirectoryService = {
  getOrganizationDirectoryRecord,
  getUserDirectoryRecord,
};
