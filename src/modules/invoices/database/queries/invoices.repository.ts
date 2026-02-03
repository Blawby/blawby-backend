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
const findInvoiceById = async (id: string, organizationId: string) => {
  const invoice = await db.query.invoices.findFirst({
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
        columns: {
          id: true,
          status: true,
          stripe_customer_id: true,
        },
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
      matter: true,
    },
  });

  return invoice;
};

/**
 * Find invoice by Stripe Invoice ID
 */
const findInvoiceByStripeId = async (stripeInvoiceId: string) => {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.stripe_invoice_id, stripeInvoiceId),
      isNull(invoices.deleted_at),
    ),
    with: {
      lineItems: true,
      client: true,
      matter: true,
    },
  });

  return invoice;
};

/**
 * List invoices by organization with filters
 */
const listInvoicesByOrganization = async (
  organizationId: string,
  filters?: {
    client_id?: string;
    matter_id?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ invoices: SelectInvoice[]; total: number }> => {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(invoices.organization_id, organizationId),
    isNull(invoices.deleted_at),
  ];

  if (filters?.client_id) {
    conditions.push(eq(invoices.client_id, filters.client_id));
  }
  if (filters?.matter_id) {
    conditions.push(eq(invoices.matter_id, filters.matter_id));
  }
  if (filters?.status) {
    conditions.push(eq(invoices.status, filters.status));
  }

  const results = await db
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.created_at))
    .limit(limit)
    .offset(offset);

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
  deletedBy: string,
  tx?: typeof db,
): Promise<SelectInvoice | undefined> => {
  const client = tx || db;
  const [invoice] = await client
    .update(invoices)
    .set({
      deleted_at: new Date(),
      deleted_by: deletedBy,
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
