import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { krabiclawOrganizationLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-organization-links.repository';
import { authHelpers } from '@/test/helpers/auth';

const { createTestOrganization } = authHelpers;

describe('krabiclawOrganizationLinksRepository', () => {
  it('creates a new link and finds it by external id', async () => {
    const org = await createTestOrganization();
    const externalOrganizationId = randomUUID();

    const created = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: org.id,
    });

    expect(created.organization_id).toBe(org.id);

    const found = await krabiclawOrganizationLinksRepository.findByExternalId(externalOrganizationId);
    expect(found?.id).toBe(created.id);
  });

  it('returns the existing link when creating with the same external id again', async () => {
    const org = await createTestOrganization();
    const externalOrganizationId = randomUUID();

    const first = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: org.id,
    });
    const second = await krabiclawOrganizationLinksRepository.create({
      external_organization_id: externalOrganizationId,
      organization_id: org.id,
    });

    expect(second.id).toBe(first.id);
  });

  it('rejects linking a second external organization to an already-linked local organization', async () => {
    const org = await createTestOrganization();

    await krabiclawOrganizationLinksRepository.create({
      external_organization_id: randomUUID(),
      organization_id: org.id,
    });

    await expect(
      krabiclawOrganizationLinksRepository.create({
        external_organization_id: randomUUID(),
        organization_id: org.id,
      })
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('returns undefined for an unknown external id', async () => {
    await expect(krabiclawOrganizationLinksRepository.findByExternalId(randomUUID())).resolves.toBeUndefined();
  });
});
