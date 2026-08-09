import { getLogger } from '@logtape/logtape';
import Cloudflare from 'cloudflare';
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
import { sanitizeError } from '@/shared/utils/logging';

const logger = getLogger(['modules', 'krabiclaw-integration', 'directory']);

const REQUEST_BUDGET_MS = 3000;

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

const runFixedQuery = async (sql: string, params: string[], deadlineAt: number): Promise<unknown[]> => {
  const { accountId, databaseId } = requireD1Config();
  const client = getClient();

  const attempt = async (): Promise<unknown[]> => {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      throw new Error('D1 query exceeded its 3-second budget');
    }
    const page = await client.d1.database.query(
      databaseId,
      { account_id: accountId, sql, params },
      { maxRetries: 0, timeout: remaining }
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
      logger.error('krabiclaw D1 query failed: {error}', { error: sanitizeError(error) });
      throw error;
    }
    logger.warn('krabiclaw D1 query failed once, retrying within budget: {error}', { error: sanitizeError(error) });
    try {
      return await attempt();
    } catch (retryError) {
      logger.error('krabiclaw D1 query failed after retry: {error}', { error: sanitizeError(retryError) });
      throw retryError;
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
    deadlineAt
  );
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one organization row for id ${organizationId}, got ${rows.length}`);
  }
  return organizationDirectoryRowSchema.parse(rows[0]);
};

const getUserDirectoryRecord = async (userId: string): Promise<KrabiClawUserDirectoryRecord> => {
  const deadlineAt = Date.now() + REQUEST_BUDGET_MS;
  const rows = await runFixedQuery('SELECT id, name, email FROM user WHERE id = ?', [userId], deadlineAt);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one user row for id ${userId}, got ${rows.length}`);
  }
  return userDirectoryRowSchema.parse(rows[0]);
};

export const krabiclawDirectoryService = {
  getOrganizationDirectoryRecord,
  getUserDirectoryRecord,
};
