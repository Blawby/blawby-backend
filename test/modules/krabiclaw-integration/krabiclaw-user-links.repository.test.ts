import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { krabiclawUserLinksRepository } from '@/modules/krabiclaw-integration/database/queries/krabiclaw-user-links.repository';
import { authHelpers } from '@/test/helpers/auth';

const { createTestUser } = authHelpers;

describe('krabiclawUserLinksRepository', () => {
  it('creates a new link and finds it by external id', async () => {
    const user = await createTestUser();
    const externalUserId = randomUUID();

    const created = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: user.id,
    });

    expect(created.user_id).toBe(user.id);

    const found = await krabiclawUserLinksRepository.findByExternalId(externalUserId);
    expect(found?.id).toBe(created.id);
  });

  it('returns the existing link when creating with the same external id again', async () => {
    const user = await createTestUser();
    const externalUserId = randomUUID();

    const first = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: user.id,
    });
    const second = await krabiclawUserLinksRepository.create({
      external_user_id: externalUserId,
      user_id: user.id,
    });

    expect(second.id).toBe(first.id);
  });

  it('rejects linking a second external user to an already-linked local user', async () => {
    const user = await createTestUser();

    await krabiclawUserLinksRepository.create({
      external_user_id: randomUUID(),
      user_id: user.id,
    });

    await expect(
      krabiclawUserLinksRepository.create({
        external_user_id: randomUUID(),
        user_id: user.id,
      })
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('returns undefined for an unknown external id', async () => {
    await expect(krabiclawUserLinksRepository.findByExternalId(randomUUID())).resolves.toBeUndefined();
  });
});
