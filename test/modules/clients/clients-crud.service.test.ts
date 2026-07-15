import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientCreatedDispatch: vi.fn(),
  findClientByOrgAndUser: vi.fn(),
  transaction: vi.fn(),
  findUserByEmail: vi.fn(),
}));

vi.mock('@/modules/clients/database/queries/clients.queries', () => ({
  clientsRepository: {
    create: vi.fn(),
    findByOrgAndUser: mocks.findClientByOrgAndUser,
  },
}));

vi.mock('@/shared/database/uow', () => ({
  getActiveTx: vi.fn(),
  uow: {
    transaction: mocks.transaction,
  },
}));

vi.mock('@/shared/events/definitions', () => ({
  ClientCreated: {
    dispatch: mocks.clientCreatedDispatch,
  },
  ClientDeleted: {
    dispatch: vi.fn(),
  },
  ClientUpdated: {
    dispatch: vi.fn(),
  },
}));

vi.mock('@/shared/repositories/users.repository', () => ({
  default: {
    findByEmail: mocks.findUserByEmail,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clientsCrudService.createClient', () => {
  it('returns the existing client when a concurrent request wins the org-user insert race', async () => {
    const user = {
      id: 'user-1',
      name: 'Client User',
      email: 'client@example.com',
    };
    const existingClient = {
      id: 'client-1',
      organization_id: 'org-1',
      user_id: user.id,
      name: user.name,
      email: user.email,
      stripe_customer_id: null,
    };
    const duplicateError = Object.assign(new Error('duplicate client'), {
      code: '23505',
      constraint: 'clients_org_user_unique',
    });

    mocks.findUserByEmail.mockResolvedValue(user);
    mocks.findClientByOrgAndUser.mockResolvedValueOnce(undefined).mockResolvedValueOnce(existingClient);
    mocks.transaction.mockRejectedValue(duplicateError);

    await expect(
      clientsCrudService.createClient(
        {
          data: {
            name: user.name,
            email: user.email,
            status: 'active',
          },
        },
        createSystemContext('org-1')
      )
    ).resolves.toEqual({ ...existingClient, user });

    expect(mocks.findClientByOrgAndUser).toHaveBeenCalledTimes(2);
    expect(mocks.clientCreatedDispatch).not.toHaveBeenCalled();
  });
});
