import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { invoiceCreationWorkflow } from '@/modules/invoices/services/invoice-creation.workflow';
import type { CreateInvoiceRequest } from '@/modules/invoices/types/invoices.types';
import { invoiceValidators } from '@/modules/invoices/validators/invoice-creation.validators';
import type { ServiceContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transaction = vi.hoisted(() => vi.fn(async (run: () => Promise<unknown>) => run()));
const dispatch = vi.hoisted(() => vi.fn(async () => 'event-id'));

vi.mock('@/shared/database/uow', () => ({
  uow: { transaction },
}));

vi.mock('@/modules/invoices/database/queries/invoices.repository', () => ({
  invoicesRepository: {
    createInvoice: vi.fn(),
    createInvoiceLineItems: vi.fn(),
    findInvoiceById: vi.fn(),
    deleteInvoiceLineItems: vi.fn(),
  },
}));

vi.mock('@/modules/invoices/services/invoice-client-resolver.service', () => ({
  invoiceClientResolver: {
    resolveClientForInvoice: vi.fn(),
  },
}));

vi.mock('@/modules/invoices/validators/invoice-creation.validators', () => ({
  invoiceValidators: {
    validateConnectedAccount: vi.fn(),
    validateMatterBelongsToClient: vi.fn(),
    validateInvoiceNumberUnique: vi.fn(),
  },
}));

vi.mock('@/modules/matters/database/queries/matter-expenses.queries', () => ({
  matterExpensesQueries: { countByIds: vi.fn(), markAsInvoiced: vi.fn() },
}));

vi.mock('@/modules/matters/database/queries/matter-milestones.queries', () => ({
  matterMilestonesQueries: { findMatterMilestoneById: vi.fn(), markAsInvoiced: vi.fn() },
}));

vi.mock('@/modules/matters/database/queries/matter-time-entries.queries', () => ({
  matterTimeEntriesQueries: { countByIds: vi.fn(), markAsInvoiced: vi.fn() },
}));

vi.mock('@/shared/events/definitions', () => ({
  InvoiceCreated: { dispatch },
}));

const organizationId = '00000000-0000-4000-8000-000000000001';
const clientId = '00000000-0000-4000-8000-000000000002';
const connectedAccountId = '00000000-0000-4000-8000-000000000003';
const userId = '00000000-0000-4000-8000-000000000004';

const data: CreateInvoiceRequest = {
  client_id: clientId,
  connected_account_id: connectedAccountId,
  invoice_number: 'INV-001',
  invoice_type: 'flat_fee',
  line_items: [{ type: 'service', description: 'Consultation', quantity: 2, unit_price: 5000 }],
};

const createdInvoice = {
  id: '00000000-0000-4000-8000-000000000005',
  client_id: clientId,
  matter_id: null,
  invoice_number: 'INV-001',
  total: 10000,
};

const ctx = { organizationId, userId } as ServiceContext;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoiceClientResolver.resolveClientForInvoice).mockResolvedValue({
    id: clientId,
    connectedAccount: { charges_enabled: true, payouts_enabled: true },
    matters: [],
  } as never);
  vi.mocked(invoiceValidators.validateInvoiceNumberUnique).mockResolvedValue();
  vi.mocked(invoicesRepository.createInvoice).mockResolvedValue({ id: createdInvoice.id } as never);
  vi.mocked(invoicesRepository.findInvoiceById).mockResolvedValue(createdInvoice as never);
});

describe('invoice creation workflow', () => {
  it('owns resolution, validation, totals, persistence, and event dispatch behind one call', async () => {
    const result = await invoiceCreationWorkflow.createInvoice(data, ctx);

    expect(result).toBe(createdInvoice);
    expect(invoiceClientResolver.resolveClientForInvoice).toHaveBeenCalledWith(
      organizationId,
      clientId,
      connectedAccountId
    );
    expect(invoiceValidators.validateConnectedAccount).toHaveBeenCalledOnce();
    expect(invoiceValidators.validateInvoiceNumberUnique).toHaveBeenCalledWith(organizationId, 'INV-001');
    expect(invoicesRepository.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: organizationId,
        client_id: clientId,
        fund_destination: 'operating',
        subtotal: 10000,
        total: 10000,
        amount_due: 10000,
        status: 'draft',
      })
    );
    expect(invoicesRepository.createInvoiceLineItems).toHaveBeenCalledWith([
      expect.objectContaining({
        invoice_id: createdInvoice.id,
        description: 'Consultation',
        line_total: 10000,
        sort_order: 0,
      }),
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
  });
});
