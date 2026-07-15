import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { invoiceService } from '@/modules/invoices/services/invoice.service';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { defineAbilityFor } from '@/shared/auth/abilities';
import { createSystemContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/invoices/database/queries/invoices.repository', () => ({
  invoicesRepository: {
    findInvoiceById: vi.fn(),
    findManyByClientId: vi.fn(),
    findOneByIdAndClientId: vi.fn(),
  },
}));

vi.mock('@/modules/invoices/services/invoice-client-resolver.service', () => ({
  invoiceClientResolver: {
    resolveUserDetailId: vi.fn(),
  },
}));

const findInvoiceById = vi.mocked(invoicesRepository.findInvoiceById);
const findManyByClientId = vi.mocked(invoicesRepository.findManyByClientId);
const findOneByIdAndClientId = vi.mocked(invoicesRepository.findOneByIdAndClientId);
const resolveUserDetailId = vi.mocked(invoiceClientResolver.resolveUserDetailId);
const clientContext = () => ({
  ...createSystemContext('practice-a', 'client-user-a'),
  memberRole: 'client',
  ability: defineAbilityFor('client', { userId: 'client-user-a', organizationId: 'practice-a' }),
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveUserDetailId.mockResolvedValue('client-a');
});

describe('invoice access safety', () => {
  it('scopes owner invoice detail to the active Practice', async () => {
    findInvoiceById.mockResolvedValue(undefined);
    const ctx = createSystemContext('practice-a', 'owner-a');

    await expect(invoiceService.getInvoiceById({ id: 'invoice-from-practice-b' }, ctx)).rejects.toBeInstanceOf(
      HTTPException
    );

    expect(findInvoiceById).toHaveBeenCalledWith('invoice-from-practice-b', 'practice-a');
  });

  it('derives client identity from the session and scopes list access to it', async () => {
    findManyByClientId.mockResolvedValue({ invoices: [], total: 0 });
    const ctx = clientContext();

    await invoiceService.listClientInvoices({ filters: {} }, ctx);

    expect(resolveUserDetailId).toHaveBeenCalledWith('practice-a', 'client-user-a');
    expect(findManyByClientId).toHaveBeenCalledWith('practice-a', 'client-a', {
      status: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('rejects an invoice id that does not belong to the resolved client', async () => {
    findOneByIdAndClientId.mockResolvedValue(undefined);
    const ctx = clientContext();

    await expect(
      invoiceService.getClientInvoiceDetail({ invoiceId: 'invoice-owned-by-client-b' }, ctx)
    ).rejects.toBeInstanceOf(HTTPException);

    expect(findOneByIdAndClientId).toHaveBeenCalledWith('practice-a', 'invoice-owned-by-client-b', 'client-a');
  });
});
