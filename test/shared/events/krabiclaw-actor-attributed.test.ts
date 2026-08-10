import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { KrabiClawActorAttributed } from '@/shared/events/definitions/krabiclaw';
import { events } from '@/shared/events/schemas/events.schema';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';

describe('KrabiClawActorAttributed', () => {
  it('persists an immutable audit row for a human actor', async () => {
    const userId = '10000000-0000-4000-8000-000000000001';
    const { id: organizationId } = await authHelpers.createTestOrganization();

    const eventId = await KrabiClawActorAttributed.dispatch(
      {
        external_organization_id: 'ext-org-1',
        external_actor_id: 'ext-user-1',
        actor_kind: 'human',
        oauth_client_id: 'client-abc',
        resolved_organization_id: organizationId,
        resolved_user_id: userId,
        method: 'GET',
        path: '/practice/details',
      },
      { actorId: userId, organizationId, critical: true }
    );

    const [row] = await getTestDb().select().from(events).where(eq(events.eventId, eventId));
    expect(row?.type).toBe('krabiclaw.actor_attributed');
    expect(row?.actorId).toBe(userId);
    expect(row?.organizationId).toBe(organizationId);
    expect(row?.payload).toMatchObject({
      external_organization_id: 'ext-org-1',
      actor_kind: 'human',
      resolved_user_id: userId,
    });
  });

  it('persists an audit row for an anonymous actor using the api actor sentinel', async () => {
    const { id: organizationId } = await authHelpers.createTestOrganization();

    const eventId = await KrabiClawActorAttributed.dispatch(
      {
        external_organization_id: 'ext-org-2',
        external_actor_id: null,
        actor_kind: 'anonymous',
        oauth_client_id: 'client-abc',
        resolved_organization_id: organizationId,
        resolved_user_id: null,
        method: 'POST',
        path: '/intakes',
      },
      { actorId: 'api', organizationId, critical: true }
    );

    const [row] = await getTestDb().select().from(events).where(eq(events.eventId, eventId));
    expect(row?.actorType).toBe('api');
    expect(row?.payload).toMatchObject({ actor_kind: 'anonymous', resolved_user_id: null });
  });
});
