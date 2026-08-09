import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { krabiclawOrganizationLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
import { krabiclawUserLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb, getTestPool } from '@/test/helpers/db';

const { resolveOrganizationAnchor, resolveUserAnchor, resolveIdentity } = krabiclawIdentityResolverService;

const orgDirectory = (id: string) => ({ id, name: `Org ${id}`, slug: `org-${id}` });
const userDirectory = (id: string) => ({ id, name: `User ${id}`, email: `${id}@example.test` });

describe('krabiclawIdentityResolverService', () => {
  it('creates a new organization anchor on first resolution', async () => {
    const externalOrganizationId = randomUUID();

    const organizationId = await resolveOrganizationAnchor(
      externalOrganizationId,
      orgDirectory(externalOrganizationId)
    );

    const [link] = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(link?.organization_id).toBe(organizationId);
  });

  it('returns the same organization anchor on repeated resolution without creating a duplicate', async () => {
    const externalOrganizationId = randomUUID();
    const directory = orgDirectory(externalOrganizationId);

    const first = await resolveOrganizationAnchor(externalOrganizationId, directory);
    const second = await resolveOrganizationAnchor(externalOrganizationId, directory);

    expect(second).toBe(first);

    const links = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(links).toHaveLength(1);
  });

  it('resolves concurrent requests for the same external organization to one anchor', async () => {
    const externalOrganizationId = randomUUID();
    const directory = orgDirectory(externalOrganizationId);

    const [first, second] = await Promise.all([
      resolveOrganizationAnchor(externalOrganizationId, directory),
      resolveOrganizationAnchor(externalOrganizationId, directory),
    ]);

    expect(second).toBe(first);

    const links = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(links).toHaveLength(1);
  });

  it('rolls back the anchor organization when the advisory lock times out', async () => {
    const externalOrganizationId = randomUUID();
    const directory = orgDirectory(externalOrganizationId);
    const lockKey = `krabiclaw:org-link:${externalOrganizationId}`;

    const pool = getTestPool();
    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);

    try {
      await expect(resolveOrganizationAnchor(externalOrganizationId, directory)).rejects.toBeInstanceOf(
        HTTPException
      );
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    const links = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(links).toHaveLength(0);
  });

  it('creates a user anchor for a human actor', async () => {
    const externalUserId = randomUUID();

    const userId = await resolveUserAnchor(externalUserId, userDirectory(externalUserId));

    const [link] = await getTestDb()
      .select()
      .from(krabiclawUserLinks)
      .where(eq(krabiclawUserLinks.external_user_id, externalUserId));
    expect(link?.user_id).toBe(userId);
  });

  it('surfaces an email collision with an existing Blawby user as a conflict and creates no orphan link', async () => {
    const existingUser = await authHelpers.createTestUser();
    const externalUserId = randomUUID();

    await expect(
      resolveUserAnchor(externalUserId, { id: externalUserId, name: 'Collides', email: existingUser.email })
    ).rejects.toBeInstanceOf(HTTPException);

    const links = await getTestDb()
      .select()
      .from(krabiclawUserLinks)
      .where(eq(krabiclawUserLinks.external_user_id, externalUserId));
    expect(links).toHaveLength(0);
  });

  it('never creates a user anchor for an anonymous actor', async () => {
    const externalOrganizationId = randomUUID();

    const identity = await resolveIdentity({
      externalOrganizationId,
      organizationDirectory: orgDirectory(externalOrganizationId),
      actorKind: 'anonymous',
    });

    expect(identity.userId).toBeNull();
    expect(identity.organizationId).toBeTruthy();
  });

  it('resolves both anchors for a human actor', async () => {
    const externalOrganizationId = randomUUID();
    const externalUserId = randomUUID();

    const identity = await resolveIdentity({
      externalOrganizationId,
      organizationDirectory: orgDirectory(externalOrganizationId),
      actorKind: 'human',
      externalUserId,
      userDirectory: userDirectory(externalUserId),
    });

    expect(identity.organizationId).toBeTruthy();
    expect(identity.userId).toBeTruthy();
  });

  it('rejects a human actor request missing user identity', async () => {
    const externalOrganizationId = randomUUID();

    await expect(
      resolveIdentity({
        externalOrganizationId,
        organizationDirectory: orgDirectory(externalOrganizationId),
        actorKind: 'human',
      })
    ).rejects.toThrow('externalUserId and userDirectory are required to resolve a human actor');
  });
});
