import {
  eq, and, isNull, sql, desc,
} from 'drizzle-orm';
import {
  invoiceLineItems,
  type InsertInvoiceLineItem,
  type SelectInvoiceLineItem,
} from '@/modules/invoices/database/schema/invoice-line-items.schema';
import {
  invoices,
  type InsertInvoice,
  type SelectInvoice,
} from '@/modules/invoices/database/schema/invoices.schema';
import type { InvoiceListFilters } from '@/modules/invoices/types/invoice-filters.types';
import { type InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { db } from '@/shared/database';

/**
 * Create a new invoice
 */
const createInvoice = async (
  data: InsertInvoice,
  tx?: typeof db,
): Promise<SelectInvoice> => {
  const client = tx || db;
  const [invoice] = await client
    .insert(invoices)
    .values(data)
    .returning();
  return invoice;
};

/**
 * Find invoice by ID with line items
 */
const findInvoiceById = async (
  id: string,
  organizationId: string,
  tx?: typeof db,
): Promise<InvoiceWithRelations | undefined> => {
  const client = tx || db;
  return await client.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organization_id, organizationId),
      isNull(invoices.deleted_at),
    ),
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
};

/**
 * Find invoice by Stripe Invoice ID
 */
const findInvoiceByStripeId = async (
  stripeInvoiceId: string,
  tx?: typeof db,
): Promise<InvoiceWithRelations | undefined> => {
  const client = tx || db;
  return await client.query.invoices.findFirst({
    where: and(
      eq(invoices.stripe_invoice_id, stripeInvoiceId),
      isNull(invoices.deleted_at),
    ),
    with: {
      lineItems: true,
      client: {
        with: { user: true },
      },
      matter: true,
      connectedAccount: true,
    },
  });
};

/**
 * List invoices by organization with filters
 */
const listInvoicesByOrganization = async (
  organizationId: string,
  filters?: InvoiceListFilters,
): Promise<{ invoices: InvoiceWithRelations[]; total: number }> => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(invoices.organization_id, organizationId),
    isNull(invoices.deleted_at),
  ];

  if (filters?.invoiceId) {
    conditions.push(eq(invoices.id, filters.invoiceId));
  }
  if (filters?.clientId) {
    conditions.push(eq(invoices.client_id, filters.clientId));
  }
  if (filters?.matterId) {
    conditions.push(eq(invoices.matter_id, filters.matterId));
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
      lineItems: true,
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
    total: Number(countResult.count),
  };
};

/**
 * Update invoice
 */
const updateInvoice = async (
  id: string,
  organizationId: string,
  data: Partial<InsertInvoice>,
  tx?: typeof db,
): Promise<SelectInvoice | undefined> => {
  const client = tx || db;
  const [invoice] = await client
    .update(invoices)
    .set({ ...data, updated_at: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.organization_id, organizationId)))
    .returning();
  return invoice;
};

/**
 * Soft delete invoice
 */
const softDeleteInvoice = async (
  id: string,
  organizationId: string,
  deletedBy: string | null,
  tx?: typeof db,
): Promise<SelectInvoice | undefined> => {
  const client = tx || db;
  const [invoice] = await client
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
const createInvoiceLineItems = async (
  items: InsertInvoiceLineItem[],
  tx?: typeof db,
): Promise<SelectInvoiceLineItem[]> => {
  const client = tx || db;
  return await client
    .insert(invoiceLineItems)
    .values(items)
    .returning();
};

/**
 * Delete line items for an invoice
 */
const deleteInvoiceLineItems = async (
  invoiceId: string,
  tx?: typeof db,
): Promise<void> => {
  const client = tx || db;
  await client
    .delete(invoiceLineItems)
    .where(eq(invoiceLineItems.invoice_id, invoiceId));
};

export const invoicesRepository = {
  createInvoice,
  findInvoiceById,
  findInvoiceByStripeId,
  listInvoicesByOrganization,
  updateInvoice,
  softDeleteInvoice,
  createInvoiceLineItems,
  deleteInvoiceLineItems,
};
