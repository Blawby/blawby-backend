import { getLogger } from '@logtape/logtape';
import { eq, and, sql } from 'drizzle-orm';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';

import {
  paymentLinks,
  type SelectPaymentLink,
  type InsertPaymentLink,
} from '@/modules/invoices/database/schema/payment-links.schema';

import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'payment-links']);

const PAYMENT_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Payment Links Service
 *
 * Manages secure tokens for public invoice payment pages.
 */
export const paymentLinksService = {
  /**
   * Create or retrieve an active payment link for an invoice
   */
  async createPaymentLink(invoiceId: string, organizationId: string): Promise<Result<SelectPaymentLink>> {
    try {
      // 1. Check for existing active link
      const existing = await db.query.paymentLinks.findFirst({
        where: and(
          eq(paymentLinks.invoice_id, invoiceId),
          eq(paymentLinks.status, 'active'),
          sql`${paymentLinks.expires_at} > now()`
        ),
      });

      if (existing) return result.ok(existing);

      // 2. Fetch invoice to get amount
      const invoice = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
      if (!invoice) return result.notFound('Invoice not found');

      // 3. Generate secure token
      const token = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // 4. Create record
      const insertData: InsertPaymentLink = {
        organization_id: organizationId,
        invoice_id: invoiceId,
        token,
        amount: invoice.total,
        currency: 'usd',
        status: 'active',
        expires_at: new Date(Date.now() + PAYMENT_LINK_TTL_MS),
      };

      const [link] = await db.insert(paymentLinks).values(insertData).returning();

      return result.ok(link);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create payment link for invoice {invoiceId}: {error}', {
        invoiceId,
        error: message,
      });
      return result.internalError('Failed to create payment link');
    }
  },

  /**
   * Find invoice by payment token (Public)
   */
  async getInvoiceByToken(token: string): Promise<Result<unknown>> {
    try {
      const link = await db.query.paymentLinks.findFirst({
        where: and(eq(paymentLinks.token, token), eq(paymentLinks.status, 'active')),
        with: {
          invoice: {
            with: {
              lineItems: true,
              organization: {
                columns: {
                  id: true,
                  name: true,
                  logo: true,
                },
              },
            },
          },
        },
      });

      if (!link || !link.invoice) return result.notFound('Payment link invalid or expired');

      // Check expiration
      if (link.expires_at && link.expires_at < new Date()) {
        await db.update(paymentLinks).set({ status: 'expired' }).where(eq(paymentLinks.id, link.id));
        return result.notFound('Payment link expired');
      }

      // Update accessed_at
      await db.update(paymentLinks).set({ accessed_at: new Date() }).where(eq(paymentLinks.id, link.id));

      return result.ok(link.invoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get invoice by token: {error}', { error: message });
      return result.internalError('Failed to retrieve invoice');
    }
  },
};
