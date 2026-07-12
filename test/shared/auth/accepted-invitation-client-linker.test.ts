import { acceptedInvitationClientLinker } from '@/shared/auth/services/accepted-invitation-client-linker.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@/modules/clients/services/clients-crud.service', () => ({
  clientsCrudService: {
    createClient: mocks.createClient,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('acceptedInvitationClientLinker', () => {
  it('links accepted client invitations to a CRM client synchronously', async () => {
    mocks.createClient.mockResolvedValue({ id: 'client-1' });

    await expect(
      acceptedInvitationClientLinker.linkAcceptedClientInvitation({
        invitationId: 'invite-1',
        organizationId: 'practice-1',
        userId: 'user-1',
        email: 'e2e+client@test-blawby.com',
        role: 'client',
      })
    ).resolves.toEqual({ linked: true, clientId: 'client-1' });

    expect(mocks.createClient).toHaveBeenCalledWith(
      {
        data: {
          name: 'New Client',
          email: 'e2e+client@test-blawby.com',
          status: 'active',
        },
      },
      expect.objectContaining({
        organizationId: 'practice-1',
        userId: 'system',
      })
    );
  });

  it('ignores accepted invitations for non-client roles', async () => {
    await expect(
      acceptedInvitationClientLinker.linkAcceptedClientInvitation({
        invitationId: 'invite-1',
        organizationId: 'practice-1',
        userId: 'user-1',
        email: 'member@test-blawby.com',
        role: 'member',
      })
    ).resolves.toEqual({ linked: false, reason: 'non-client-role' });

    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
