import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { krabiclawOrganizationLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository';
import { krabiclawOrganizationLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
import { krabiclawUserLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';
import { krabiclawIdentityResolverService } from '@/modules/krabiclaw-integration/services/krabiclaw-identity-resolver.service';
import { organizations, users } from '@/schema/better-auth-schema';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb, getTestPool } from '@/test/helpers/db';

const mocks = vi.hoisted(() => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@logtape/logtape', () => ({ getLogger: () => mocks.logger }));

const { resolveOrganizationAnchor, resolveUserAnchor, resolveIdentity } = krabiclawIdentityResolverService;

const orgDirectory = (id: string) => ({ id, name: `Org ${id}`, slug: `org-${id}` });
const userDirectory = (id: string) => ({ id, name: `User ${id}`, email: `${id}@example.test` });
const anchorEmailFor = (externalUserId: string): string => {
  const digest = createHash('sha256').update(externalUserId).digest('hex').slice(0, 48);
  return `kc-anchor-${digest}@blawby.invalid`;
};
const anchorSlugFor = (externalOrganizationId: string): string =>
  `kc-anchor-${createHash('sha256').update(externalOrganizationId).digest('hex').slice(0, 32)}`;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

    const [anchorOrganization] = await getTestDb()
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    expect(anchorOrganization?.slug).toBe(anchorSlugFor(externalOrganizationId));
    expect(anchorOrganization?.slug).not.toContain(externalOrganizationId);
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
    const externalOrganizationId = `sensitive-${randomUUID()}`;
    const directory = orgDirectory(externalOrganizationId);
    const lockKey = `krabiclaw:org-link:${externalOrganizationId}`;

    const pool = getTestPool();
    const holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);

    try {
      await expect(resolveOrganizationAnchor(externalOrganizationId, directory)).rejects.toBeInstanceOf(HTTPException);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    const links = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(links).toHaveLength(0);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain(externalOrganizationId);
  });

  it('creates a user anchor for a human actor', async () => {
    const externalUserId = randomUUID();
    const directory = userDirectory(externalUserId);

    const userId = await resolveUserAnchor(externalUserId, directory);

    const [link] = await getTestDb()
      .select()
      .from(krabiclawUserLinks)
      .where(eq(krabiclawUserLinks.external_user_id, externalUserId));
    expect(link?.user_id).toBe(userId);

    const [anchorUser] = await getTestDb().select().from(users).where(eq(users.id, userId));
    expect(anchorUser?.email).toBe(anchorEmailFor(externalUserId));
    expect(anchorUser?.email).not.toBe(directory.email);
    expect(anchorUser?.email).not.toContain(externalUserId);
    expect(anchorUser?.email.endsWith('@blawby.invalid')).toBe(true);
  });

  it('resolves concurrent requests for the same external user to one anchor', async () => {
    const externalUserId = randomUUID();
    const directory = userDirectory(externalUserId);

    const [first, second] = await Promise.all([
      resolveUserAnchor(externalUserId, directory),
      resolveUserAnchor(externalUserId, directory),
    ]);

    expect(second).toBe(first);

    const links = await getTestDb()
      .select()
      .from(krabiclawUserLinks)
      .where(eq(krabiclawUserLinks.external_user_id, externalUserId));
    expect(links).toHaveLength(1);
  });

  it('surfaces an anchor email collision as a sanitized conflict and creates no orphan link', async () => {
    const externalUserId = `sensitive-${randomUUID()}`;
    const directoryEmail = `directory-${randomUUID()}@example.test`;
    await authHelpers.createTestUser({ email: anchorEmailFor(externalUserId) });

    await expect(
      resolveUserAnchor(externalUserId, { id: externalUserId, name: 'Collides', email: directoryEmail })
    ).rejects.toMatchObject({ status: 409 });

    const links = await getTestDb()
      .select()
      .from(krabiclawUserLinks)
      .where(eq(krabiclawUserLinks.external_user_id, externalUserId));
    expect(links).toHaveLength(0);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    const loggedFailure = JSON.stringify(mocks.logger.warn.mock.calls);
    expect(loggedFailure).not.toContain(externalUserId);
    expect(loggedFailure).not.toContain(directoryEmail);
    expect(loggedFailure).not.toContain(anchorEmailFor(externalUserId));
  });

  it('maps foreign key failures to a sanitized bad request', async () => {
    const externalOrganizationId = `sensitive-${randomUUID()}`;
    const databaseFailure = {
      code: '23503',
      detail: `PostgreSQL detail containing ${externalOrganizationId}`,
    };
    vi.spyOn(krabiclawOrganizationLinksRepository, 'findByExternalId')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(databaseFailure);

    let caught: unknown = undefined;
    try {
      await resolveOrganizationAnchor(externalOrganizationId, orgDirectory(externalOrganizationId));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HTTPException);
    if (!(caught instanceof HTTPException)) {
      throw new Error('Expected an HTTPException');
    }
    expect(caught.status).toBe(400);
    expect(caught.cause).toBe(databaseFailure);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain(externalOrganizationId);
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain(databaseFailure.detail);
  });

  it('keeps serialization failures retryable with a sanitized message and preserved cause', async () => {
    const externalOrganizationId = `sensitive-${randomUUID()}`;
    const databaseFailure = {
      code: '40001',
      detail: `PostgreSQL detail containing ${externalOrganizationId}`,
    };
    vi.spyOn(krabiclawOrganizationLinksRepository, 'findByExternalId')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(databaseFailure);

    let caught: unknown = undefined;
    try {
      await resolveOrganizationAnchor(externalOrganizationId, orgDirectory(externalOrganizationId));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(HTTPException);
    if (!(caught instanceof Error)) {
      throw new Error('Expected an Error');
    }
    expect(caught.message).toBe('Identity anchor database serialization failure — retry');
    expect(caught.cause).toBe(databaseFailure);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(externalOrganizationId);
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(databaseFailure.detail);
  });

  it('wraps unknown database failures without logging sensitive details', async () => {
    const externalOrganizationId = `sensitive-${randomUUID()}`;
    const databaseFailure = new Error(`PostgreSQL detail containing ${externalOrganizationId}`);
    vi.spyOn(krabiclawOrganizationLinksRepository, 'findByExternalId')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(databaseFailure);

    let caught: unknown = undefined;
    try {
      await resolveOrganizationAnchor(externalOrganizationId, orgDirectory(externalOrganizationId));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(HTTPException);
    if (!(caught instanceof Error)) {
      throw new Error('Expected an Error');
    }
    expect(caught.message).toBe('Identity anchor database operation failed');
    expect(caught.cause).toBe(databaseFailure);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    const loggedFailure = JSON.stringify(mocks.logger.error.mock.calls);
    expect(loggedFailure).not.toContain(externalOrganizationId);
    expect(loggedFailure).not.toContain(databaseFailure.message);
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

  it('rolls back the organization anchor when human user resolution fails', async () => {
    const externalOrganizationId = randomUUID();
    const externalUserId = randomUUID();
    await authHelpers.createTestUser({ email: anchorEmailFor(externalUserId) });

    await expect(
      resolveIdentity({
        externalOrganizationId,
        organizationDirectory: orgDirectory(externalOrganizationId),
        actorKind: 'human',
        externalUserId,
        userDirectory: userDirectory(externalUserId),
      })
    ).rejects.toMatchObject({ status: 409 });

    const organizationLinks = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(organizationLinks).toHaveLength(0);
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

    const organizationLinks = await getTestDb()
      .select()
      .from(krabiclawOrganizationLinks)
      .where(eq(krabiclawOrganizationLinks.external_organization_id, externalOrganizationId));
    expect(organizationLinks).toHaveLength(0);
  });
});
