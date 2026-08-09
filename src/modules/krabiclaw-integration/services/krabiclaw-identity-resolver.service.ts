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
import { wrapDbError } from '@/shared/utils/db-error';

const logger = getLogger(['modules', 'krabiclaw-integration', 'identity-resolver']);

const LOCK_TIMEOUT = '2s';

const readCode = (error: unknown): unknown =>
  error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;

const isLockTimeout = (error: unknown): boolean => {
  if (readCode(error) === '55P03') {
    return true;
  }
  const cause = error && typeof error === 'object' && 'cause' in error ? (error as { cause?: unknown }).cause : null;
  return readCode(cause) === '55P03';
};

const withAnchorLock = async <T>(lockKey: string, execute: () => Promise<T>): Promise<T> => {
  try {
    return await uow.transaction(async () => {
      const trx = getActiveTx();
      await trx.execute(sql.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`));
      await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      return execute();
    });
  } catch (error) {
    if (isLockTimeout(error)) {
      logger.warn('krabiclaw identity anchor lock timed out: {lockKey}', { lockKey });
      throw new HTTPException(409, {
        message: 'Identity resolution timed out due to concurrent activity. Please retry.',
      });
    }
    return wrapDbError(error);
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

  return withAnchorLock(`krabiclaw:org-link:${externalOrganizationId}`, async () => {
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

  return withAnchorLock(`krabiclaw:user-link:${externalUserId}`, async () => {
    const alreadyLinked = await krabiclawUserLinksRepository.findByExternalId(externalUserId);
    if (alreadyLinked) {
      return alreadyLinked.user_id;
    }

    const [anchorUser] = await getActiveTx()
      .insert(users)
      .values({
        name: directory.name,
        email: directory.email,
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
