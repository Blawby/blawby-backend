/**
 * Process Invoice Payment Worker Task
 * Triggered by InvoiceStripePaymentReceived event (via outbox)
 * Worker owns invoice-domain sequencing and calls generic financial engines
 */

import type { Task } from 'graphile-worker';
import { getLogger } from '@logtape/logtape';
import { getActiveTx, uow } from '@/shared/database/uow';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { trustService } from '@/modules/trust/services/trust.service';
import { InvoicePaid } from '@/shared/events/definitions';
import { RetainerLowBalance } from '@/shared/events/definitions/matters';
import { billingRecorder, fundManagement, retainerPaymentFlow, transferExecutor } from '@/engines/financial';

const logger = getLogger(['workers', 'tasks', 'process-invoice-payment']);

interface ProcessInvoicePaymentPayload {
  invoice_id: string;
  organization_id: string;
  stripe_invoice_id: string;
  stripe_amount_paid: number;
  stripe_amount_remaining: number;
  stripe_paid_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_on_behalf_of?: string | null;
}

export const processInvoicePayment: Task = async (payload: unknown) => {
  const data = payload as ProcessInvoicePaymentPayload;
  const { invoice_id, organization_id, stripe_invoice_id, stripe_amount_paid } = data;

  logger.info('Processing invoice payment from worker: {invoiceId}', {
    invoiceId: invoice_id,
    stripeInvoiceId: stripe_invoice_id,
    amount: stripe_amount_paid,
  });

  try {
    await uow.transaction(async () => {
      const invoice = await invoicesRepository.findInvoiceByStripeId(stripe_invoice_id);
      if (!invoice) {
        throw new Error(`Invoice with Stripe ID ${stripe_invoice_id} not found`);
      }

      const fundDestination = (invoice.fund_destination || 'operating') as 'operating' | 'trust';
      const invoiceType = invoice.invoice_type || 'flat_fee';
      const matterId = invoice.matter_id ?? null;
      const clientId = invoice.client_id ?? null;

      const routing = fundManagement.routePayment(
        {
          id: invoice.id,
          fund_destination: fundDestination,
          matter_id: matterId,
          invoice_number: invoice.invoice_number,
          invoice_type: invoiceType,
        },
        invoice.connected_account_id
      );

      const transfer = await transferExecutor.execute({
        amount: stripe_amount_paid,
        currency: 'usd',
        routing,
      });

      await invoicesRepository.updateInvoice(
        invoice.id,
        organization_id,
        {
          status: 'paid',
          amount_paid: stripe_amount_paid,
          stripe_transfer_id: transfer.transferId,
        }
      );

      if (transfer.transferId) {
        await billingRecorder.record(
          {
            organizationId: organization_id,
            payableId: invoice.id,
            payableType: 'invoice',
            matterId,
            amount: stripe_amount_paid,
            transferId: transfer.transferId,
            destinationAccountId: invoice.connected_account_id,
            metadata: {
              stripe_invoice_id,
              invoice_type: invoiceType,
              fund_destination: fundDestination,
            },
          }
        );
      }

      if (invoiceType === 'retainer_deposit' && matterId && clientId) {
        await retainerPaymentFlow.recordDeposit(
          {
            organizationId: organization_id,
            clientId,
            matterId,
            amount: stripe_amount_paid,
            invoiceId: invoice.id,
          }
        );

        const matter = await mattersQueries.findMatterById(matterId);
        if (matter && matter.retainer_low_balance_threshold !== null && matter.retainer_low_balance_threshold > 0) {
          const balance = await trustService.getBalanceWithTx({ organizationId: organization_id, clientId });
          const matterBalance = balance.byMatter.find((m) => m.matter_id === matterId)?.balance ?? 0;
          if (matterBalance < matter.retainer_low_balance_threshold) {
            await RetainerLowBalance.dispatch(
              {
                matter_id: matterId,
                organization_id,
                current_balance: matterBalance,
                threshold: matter.retainer_low_balance_threshold,
              },
              { actorId: 'worker', actorType: 'system', organizationId: organization_id, tx: getActiveTx() }
            );
          }
        }
      }

      await InvoicePaid.dispatch(
        {
          invoice_id: invoice.id,
          organization_id,
          matter_id: matterId,
          stripe_invoice_id,
          amount_paid: stripe_amount_paid,
          retainer_deducted: invoiceType === 'retainer_deposit' && !!matterId && !!clientId,
        },
        { actorId: 'worker', actorType: 'system', organizationId: organization_id, tx: getActiveTx() }
      );
    });

    logger.info('Invoice payment processed successfully: {invoiceId}', { invoiceId: invoice_id });
  } catch (error) {
    logger.error('Failed to process invoice payment: {invoiceId} {error}', {
      invoiceId: invoice_id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
