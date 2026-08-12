import { createHash } from 'node:crypto';
import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { krabiclawOrganizationLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository';
import { krabiclawUserLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository';
import type {
  KrabiClawOrganizationDirectoryRecord,
  KrabiClawUserDirectoryRecord,
} from '@/modules/krabiclaw-integration/types/directory.types';
import type {
  KrabiClawActorKind,
  KrabiClawResolvedIdentity,
} from '@/modules/krabiclaw-integration/types/identity.types';
import { organizations, users } from '@/schema/better-auth-schema';
import { getActiveTx, uow } from '@/shared/database/uow';

const logger = getLogger(['modules', 'krabiclaw-integration', 'identity-resolver']);

const LOCK_TIMEOUT = '2s';
const PG_LOCK_NOT_AVAILABLE = '55P03';
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_SERIALIZATION_FAILURE = '40001';

type AnchorKind = 'organization' | 'user';

interface AnchorContext {
  kind: AnchorKind;
  externalId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readCode = (value: unknown): unknown => (isRecord(value) ? value.code : undefined);

const readPgCode = (error: unknown): unknown =>
  readCode(error) ?? (isRecord(error) ? readCode(error.cause) : undefined);

const hashExternalId = (value: string): string => createHash('sha256').update(value).digest('hex');

const anchorLogContext = (context: AnchorContext, errorCode?: unknown): Record<string, unknown> => ({
  anchorKind: context.kind,
  externalIdHash: hashExternalId(context.externalId).slice(0, 16),
  ...(typeof errorCode === 'string' ? { errorCode } : {}),
});

const createAnchorEmail = (externalUserId: string): string =>
  `kc-anchor-${hashExternalId(externalUserId).slice(0, 48)}@blawby.invalid`;

const throwAnchorDatabaseError = (error: unknown, context: AnchorContext): never => {
  const code = readPgCode(error);
  const logContext = anchorLogContext(context, code);

  if (code === PG_UNIQUE_VIOLATION) {
    logger.warn('krabiclaw identity anchor unique constraint violation', logContext);
    throw new HTTPException(409, { message: 'Resource already exists', cause: error });
  }
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    logger.warn('krabiclaw identity anchor foreign key violation', logContext);
    throw new HTTPException(400, {
      message: 'Invalid reference — related resource not found',
      cause: error,
    });
  }
  if (code === PG_SERIALIZATION_FAILURE) {
    logger.error('krabiclaw identity anchor serialization failure', logContext);
    throw new Error('Identity anchor database serialization failure — retry', { cause: error });
  }

  logger.error('krabiclaw identity anchor database operation failed', logContext);
  throw new Error('Identity anchor database operation failed', { cause: error });
};

const isLockTimeout = (error: unknown): boolean => readPgCode(error) === PG_LOCK_NOT_AVAILABLE;

const withAnchorLock = async <T>(context: AnchorContext, execute: () => Promise<T>): Promise<T> => {
  const lockNamespace = context.kind === 'organization' ? 'org-link' : 'user-link';
  const lockKey = `krabiclaw:${lockNamespace}:${context.externalId}`;
  try {
    return await uow.transaction(async () => {
      const trx = getActiveTx();
      await trx.execute(sql.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`));
      await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      return execute();
    });
  } catch (error) {
    if (isLockTimeout(error)) {
      logger.warn('krabiclaw identity anchor lock timed out', anchorLogContext(context, readPgCode(error)));
      throw new HTTPException(409, {
        message: 'Identity resolution timed out due to concurrent activity. Please retry.',
        cause: error,
      });
    }
    return throwAnchorDatabaseError(error, context);
  }
};

const resolveOrganizationAnchor = async (
  externalOrganizationId: string,
  directory: KrabiClawOrganizationDirectoryRecord
): Promise<string> => {
  const existing = await krabiclawOrganizationLinksRepository.findByExternalId(externalOrganizationId);
  if (existing) {
    return existing.organization_id;
  }

  return withAnchorLock({ kind: 'organization', externalId: externalOrganizationId }, async () => {
    const alreadyLinked = await krabiclawOrganizationLinksRepository.findByExternalId(externalOrganizationId);
    if (alreadyLinked) {
      return alreadyLinked.organization_id;
    }

    const [anchorOrganization] = await getActiveTx()
      .insert(organizations)
      .values({
        name: directory.name,
        slug: `krabiclaw-${externalOrganizationId}`,
        createdAt: new Date(),
      })
      .returning();

    const link = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: anchorOrganization.id,
    });

    return link.organization_id;
  });
};

const resolveUserAnchor = async (externalUserId: string, directory: KrabiClawUserDirectoryRecord): Promise<string> => {
  const existing = await krabiclawUserLinksRepository.findByExternalId(externalUserId);
  if (existing) {
    return existing.user_id;
  }

  return withAnchorLock({ kind: 'user', externalId: externalUserId }, async () => {
    const alreadyLinked = await krabiclawUserLinksRepository.findByExternalId(externalUserId);
    if (alreadyLinked) {
      return alreadyLinked.user_id;
    }

    const [anchorUser] = await getActiveTx()
      .insert(users)
      .values({
        name: directory.name,
        email: createAnchorEmail(externalUserId),
      })
      .returning();

    const link = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: anchorUser.id,
    });

    return link.user_id;
  });
};

const resolveIdentity = async (params: {
  externalOrganizationId: string;
  organizationDirectory: KrabiClawOrganizationDirectoryRecord;
  actorKind: KrabiClawActorKind;
  externalUserId?: string;
  userDirectory?: KrabiClawUserDirectoryRecord;
}): Promise<KrabiClawResolvedIdentity> => {
  const organizationId = await resolveOrganizationAnchor(params.externalOrganizationId, params.organizationDirectory);

  if (params.actorKind === 'anonymous') {
    return { organizationId, userId: null };
  }

  if (!params.externalUserId || !params.userDirectory) {
    throw new Error('externalUserId and userDirectory are required to resolve a human actor');
  }

  const userId = await resolveUserAnchor(params.externalUserId, params.userDirectory);
  return { organizationId, userId };
};

export const krabiclawIdentityResolverService = {
  resolveOrganizationAnchor,
  resolveUserAnchor,
  resolveIdentity,
};
