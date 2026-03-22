import { getTestDb } from '@/test/helpers/db';
import crypto from 'crypto';
import type { invoices } from '@/schema';
import type { matters } from '@/modules/matters/database/schema/matters.schema';

/**
 * Factory functions for creating test data
 */

export const factories = {
  async createInvoice(
    orgId: string,
    overrides: Partial<typeof invoices.$inferInsert> = {}
  ): Promise<Partial<typeof invoices.$inferInsert>> {
    const invoiceId = crypto.randomUUID();

    await getTestDb()
      .insert(invoices)
      .values({
        id: invoiceId,
        organizationId: orgId,
        ...overrides,
      });

    return { id: invoiceId, organizationId: orgId, ...overrides };
  },

  async createMatter(
    orgId: string,
    overrides: Partial<typeof matters.$inferInsert> = {}
  ): Promise<Partial<typeof matters.$inferInsert>> {
    const matterId = crypto.randomUUID();

    await getTestDb()
      .insert(matters)
      .values({
        id: matterId,
        organizationId: orgId,
        ...overrides,
      });

    return { id: matterId, organizationId: orgId, ...overrides };
  },
};
