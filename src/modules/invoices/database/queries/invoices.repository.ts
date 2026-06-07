import {
  invoiceLineItemsSchema,
  invoicesSchema,
  type InsertInvoice,
  type InsertInvoiceLineItem,
  type SelectInvoice,
  type SelectInvoiceLineItem,
} from '@/modules/invoices/database/schema';
import type { InvoiceListFilters, InvoiceSummary, InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { db } from '@/shared/database';
import { getActiveTx } from '@/shared/database/uow';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

const { invoices } = invoicesSchema;
const { invoiceLineItems } = invoiceLineItemsSchema;

/**
 * Create a new invoice
 */
const createInvoice = async (data: InsertInvoice): Promise<SelectInvoice> => {
  const [invoice] = await getActiveTx().insert(invoices).values(data).returning();

  if (!invoice) {
    throw new Error('Failed to create invoice');
  }

  return invoice;
};

/**
 * Find invoice by ID with line items
 */
const findInvoiceById = async (id: string, organizationId: string): Promise<InvoiceWithRelations | undefined> =>
  await getActiveTx().query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.organization_id, organizationId), isNull(invoices.deleted_at)),
    with: {
      lineItems: {
        orderBy: (li, { asc }) => [asc(li.sort_order)],
      },
      client: {
        with: {
          user: true,
        },
      },
      matter: true,
      connectedAccount: true,
    },
  });

/**
 * Find invoice by Stripe Invoice ID
 */
const findInvoiceByStripeId = async (stripeInvoiceId: string): Promise<InvoiceWithRelations | undefined> =>
  await getActiveTx().query.invoices.findFirst({
    where: and(eq(invoices.stripe_invoice_id, stripeInvoiceId), isNull(invoices.deleted_at)),
    with: {
      lineItems: true,
      client: {
        with: { user: true },
      },
      matter: true,
      connectedAccount: true,
    },
  });

/**
 * Find invoice by Stripe Invoice ID with row locking (FOR UPDATE)
 * Use this inside transactions to prevent race conditions
 */
const findInvoiceByStripeIdWithLock = async (
  stripeInvoiceId: string
): Promise<{ id: string; status: string; organization_id: string } | undefined> => {
  const [row] = await getActiveTx()
    .select({
      id: invoices.id,
      status: invoices.status,
      organization_id: invoices.organization_id,
    })
    .from(invoices)
    .where(and(eq(invoices.stripe_invoice_id, stripeInvoiceId), isNull(invoices.deleted_at)))
    .for('update');

  return row;
};

/**
 * List invoices by organization with filters
 */
const listInvoicesByOrganization = async (
  organizationId: string,
  filters?: InvoiceListFilters
): Promise<{ invoices: InvoiceSummary[]; total: number }> => {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(invoices.organization_id, organizationId), isNull(invoices.deleted_at)];

  if (filters?.client_id) {
    conditions.push(eq(invoices.client_id, filters.client_id));
  }
  if (filters?.matter_id) {
    conditions.push(eq(invoices.matter_id, filters.matter_id));
  }
  if (filters?.status) {
    conditions.push(eq(invoices.status, filters.status));
  }

  const results = await db.query.invoices.findMany({
    where: and(...conditions),
    orderBy: desc(invoices.created_at),
    limit,
    offset,
    with: {
      client: {
        with: { user: true },
      },
      matter: true,
      connectedAccount: true,
    },
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(and(...conditions));

  return {
    invoices: results,
    total: countResult?.count ?? 0,
  };
};

/**
 * Update invoice
 */
const updateInvoice = async (
  id: string,
  organizationId: string,
  data: Partial<InsertInvoice>
): Promise<SelectInvoice | undefined> => {
  const [invoice] = await getActiveTx()
    .update(invoices)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.organization_id, organizationId)))
    .returning();
  return invoice;
};

/**
 * Transition invoice status atomically (only when current status matches expected)
 */
const transitionInvoiceStatus = async (
  id: string,
  organizationId: string,
  fromStatus: string,
  toStatus: string
): Promise<SelectInvoice | undefined> => {
  const [invoice] = await getActiveTx()
    .update(invoices)
    .set({
      status: toStatus,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(invoices.id, id),
        eq(invoices.organization_id, organizationId),
        eq(invoices.status, fromStatus),
        isNull(invoices.deleted_at)
      )
    )
    .returning();

  return invoice;
};

const persistStripeInvoiceId = async (
  id: string,
  organizationId: string,
  stripeInvoiceId: string
): Promise<
  | { status: 'linked'; invoice: SelectInvoice }
  | { status: 'already-linked'; invoice: SelectInvoice }
  | { status: 'missing' }
> => {
  const [invoice] = await getActiveTx()
    .update(invoices)
    .set({
      stripe_invoice_id: stripeInvoiceId,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(invoices.id, id),
        eq(invoices.organization_id, organizationId),
        isNull(invoices.deleted_at),
        isNull(invoices.stripe_invoice_id)
      )
    )
    .returning();

  if (invoice) {
    return { status: 'linked', invoice };
  }

  const [existingInvoice] = await getActiveTx()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organization_id, organizationId)))
    .limit(1);

  if (!existingInvoice || existingInvoice.deleted_at) {
    return { status: 'missing' };
  }

  return { status: 'already-linked', invoice: existingInvoice };
};

/**
 * Soft delete invoice
 */
const softDeleteInvoice = async (
  id: string,
  organizationId: string,
  deletedBy: string | null
): Promise<SelectInvoice | undefined> => {
  const [invoice] = await getActiveTx()
    .update(invoices)
    .set({
      deleted_at: new Date(),
      deleted_by: deletedBy ?? null,
      updated_at: new Date(),
    })
    .where(and(eq(invoices.id, id), eq(invoices.organization_id, organizationId)))
    .returning();
  return invoice;
};

/**
 * Create line items for an invoice
 */
const createInvoiceLineItems = async (items: InsertInvoiceLineItem[]): Promise<SelectInvoiceLineItem[]> =>
  await getActiveTx().insert(invoiceLineItems).values(items).returning();

/**
 * Delete line items for an invoice
 */
const deleteInvoiceLineItems = async (invoiceId: string): Promise<void> => {
  await getActiveTx().delete(invoiceLineItems).where(eq(invoiceLineItems.invoice_id, invoiceId));
};

/**
 * Find all invoices for a given client (by user_details.id), no line items (for list view).
 */
const findManyByClientId = async (
  organizationId: string,
  userDetailId: string,
  filters?: { status?: string; page?: number; limit?: number }
): Promise<{ invoices: InvoiceSummary[]; total: number }> => {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const offset = (page - 1) * limit;
  const conditions: Parameters<typeof and>[0][] = [
    eq(invoices.organization_id, organizationId),
    eq(invoices.client_id, userDetailId),
    isNull(invoices.deleted_at),
  ];
  if (filters?.status) {
    conditions.push(eq(invoices.status, filters.status));
  }
  const results = await getActiveTx().query.invoices.findMany({
    where: and(...(conditions as [ReturnType<typeof eq>])),
    orderBy: (inv, { desc: d }) => [d(inv.created_at)],
    limit,
    offset,
    with: {
      client: { with: { user: true } },
      matter: true,
      connectedAccount: true,
    },
  });

  const [countResult] = await getActiveTx()
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(and(...(conditions as [ReturnType<typeof eq>])));

  return {
    invoices: results,
    total: countResult?.count ?? 0,
  };
};

/**
 * Find a single invoice for a client, with line items (for detail view).
 */
const findOneByIdAndClientId = async (
  organizationId: string,
  invoiceId: string,
  userDetailId: string
): Promise<InvoiceWithRelations | undefined> =>
  await getActiveTx().query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      eq(invoices.organization_id, organizationId),
      eq(invoices.client_id, userDetailId),
      isNull(invoices.deleted_at)
    ),
    with: {
      lineItems: { orderBy: (li, { asc }) => [asc(li.sort_order)] },
      client: { with: { user: true } },
      matter: true,
      connectedAccount: true,
    },
  });

/**
 * Invoices Repository
 */
export const invoicesRepository = {
  createInvoice,
  findInvoiceById,
  findInvoiceByStripeId,
  findInvoiceByStripeIdWithLock,
  listInvoicesByOrganization,
  findManyByClientId,
  findOneByIdAndClientId,
  updateInvoice,
  transitionInvoiceStatus,
  persistStripeInvoiceId,
  softDeleteInvoice,
  createInvoiceLineItems,
  deleteInvoiceLineItems,
} as const;
