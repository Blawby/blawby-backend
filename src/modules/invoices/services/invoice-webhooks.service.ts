import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { PLATFORM_VARIABLE_FEE_RATE } from '@/modules/invoices/constants';
import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { trustService } from '@/modules/trust/services/trust.service';
import { db } from '@/shared/database';
import { InvoicePaid, InvoicePaymentFailed, InvoiceVoided, InvoiceDeleted } from '@/shared/events/definitions';
import { RetainerLowBalance } from '@/shared/events/definitions/matters';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['invoices', 'webhooks-service']);
const INVOICE_TRANSFER_IDEMPOTENCY_PREFIX = 'invoice-paid-transfer';

const getChargeIdFromInvoice = (stripeInvoice: Stripe.Invoice): string | null => {
  const rawStripeInvoice = stripeInvoice as unknown as Record<string, unknown>;
  const latestChargeId = typeof rawStripeInvoice.latest_charge === 'string' ? rawStripeInvoice.latest_charge : null;
  const legacyChargeId = typeof rawStripeInvoice.charge === 'string' ? rawStripeInvoice.charge : null;
  return latestChargeId ?? legacyChargeId;
};

const getPaymentIntentIdFromInvoice = (stripeInvoice: Stripe.Invoice): string | null => {
  const rawStripeInvoice = stripeInvoice as unknown as Record<string, unknown>;
  if (typeof rawStripeInvoice.payment_intent === 'string') {
    return rawStripeInvoice.payment_intent;
  }
  if (typeof rawStripeInvoice.payment_intent === 'object' && rawStripeInvoice.payment_intent !== null) {
    const paymentIntent = rawStripeInvoice.payment_intent as Record<string, unknown>;
    return typeof paymentIntent.id === 'string' ? paymentIntent.id : null;
  }
  return null;
};

const calculateMeteredFeeCents = async (stripeInvoice: Stripe.Invoice): Promise<number> => {
  const variablePlatformFee = Math.round(stripeInvoice.amount_paid * PLATFORM_VARIABLE_FEE_RATE);
  const chargeId = getChargeIdFromInvoice(stripeInvoice);
  if (!chargeId) {
    return variablePlatformFee;
  }

  try {
    const charge = await stripe.charges.retrieve(chargeId, {
      expand: ['balance_transaction'],
    });
    const stripeFee = typeof charge.balance_transaction === 'string' ? 0 : (charge.balance_transaction?.fee ?? 0);
    return stripeFee + variablePlatformFee;
  } catch (error) {
    logger.error('Failed to fetch Stripe balance transaction fee for charge {chargeId}: {error}', {
      chargeId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return variablePlatformFee;
  }
};

/**
 * Handle invoice.paid event
 */
const handleInvoicePaid = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
      return result.ok<void>(undefined);
    }

    const chargeId = getChargeIdFromInvoice(stripeInvoice);
    const paymentIntentId = getPaymentIntentIdFromInvoice(stripeInvoice);
    const meteredFeeCents = await calculateMeteredFeeCents(stripeInvoice);
    let destinationAccountId = invoice.connected_account_id;
    if (stripeInvoice.on_behalf_of) {
      destinationAccountId =
        typeof stripeInvoice.on_behalf_of === 'string' ? stripeInvoice.on_behalf_of : stripeInvoice.on_behalf_of.id;
    }

    const routingResult = fundRouterService.routePayment(
      {
        id: invoice.id,
        fund_destination: invoice.fund_destination,
        matter_id: invoice.matter_id,
        invoice_number: invoice.invoice_number,
        invoice_type: invoice.invoice_type,
      },
      destinationAccountId
    );
    if (!routingResult.success) {
      logger.error('Fund routing failed for invoice {invoiceId}: {error}', {
        invoiceId: invoice.id,
        error: routingResult.error.message,
      });
      return result.internalError('Fund routing failed');
    }

    const routingInstruction = routingResult.data;
    const transfer = !routingInstruction.holdForApproval
      ? await stripe.transfers.create(
          {
            amount: stripeInvoice.amount_paid,
            currency: 'usd',
            destination: routingInstruction.destination,
            metadata: routingInstruction.metadata,
          },
          {
            idempotencyKey: `${INVOICE_TRANSFER_IDEMPOTENCY_PREFIX}:${stripeInvoice.id}`,
          }
        )
      : null;

    if (transfer) {
      logger.info(
        'Created Stripe transfer {transferId} for invoice {invoiceId} with fund_destination: {fundDestination}',
        {
          transferId: transfer.id,
          invoiceId: invoice.id,
          fundDestination: routingInstruction.metadata.fund_destination,
        }
      );
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'paid',
          amount_paid: stripeInvoice.amount_paid,
          amount_due: stripeInvoice.amount_remaining,
          paid_at: stripeInvoice.status_transitions.paid_at
            ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
            : null,
        },
        tx
      );
      // 1. Persist transfer/billing state after the Stripe side effect succeeds.
      if (transfer) {
        await invoicesRepository.updateInvoice(
          invoice.id,
          invoice.organization_id,
          {
            stripe_charge_id: chargeId,
            stripe_payment_intent_id: paymentIntentId,
            stripe_transfer_id: transfer.id,
          },
          tx
        );

        // 3. Create billing_transaction record with transfer ID
        await billingTransactionsRepository.createTransaction(
          {
            organization_id: invoice.organization_id,
            invoice_id: invoice.id,
            matter_id: invoice.matter_id,
            amount: stripeInvoice.amount_paid,
            metered_fee_cents: meteredFeeCents,
            type: 'payout',
            status: 'completed',
            destination_account_id: destinationAccountId,
            stripe_transfer_id: transfer.id,
            completed_at: stripeInvoice.status_transitions.paid_at
              ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
              : null,
            metadata: {
              stripe_invoice_id: stripeInvoice.id,
              stripe_charge_id: chargeId,
              invoice_type: invoice.invoice_type,
              fund_destination: routingInstruction.metadata.fund_destination,
              metered_fee_cents: meteredFeeCents,
            },
          },
          tx
        );
      } else {
        await invoicesRepository.updateInvoice(
          invoice.id,
          invoice.organization_id,
          {
            stripe_charge_id: chargeId,
            stripe_payment_intent_id: paymentIntentId,
          },
          tx
        );
      }

      // 2. Handle retainer transactions (if applicable)
      if (invoice.matter_id && routingInstruction.updateRetainerBalance) {
        // Get matter to access client_id for trust ledger
        const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
        if (matter?.client_id) {
          // 4a. Record in trust ledger (source of truth)
          const depositResult = await trustService.recordDeposit(
            {
              organizationId: invoice.organization_id,
              clientId: matter.client_id,
              matterId: invoice.matter_id,
              amount: stripeInvoice.amount_paid,
              invoiceId: invoice.id,
              stripePaymentIntentId: paymentIntentId,
              source: 'stripe_payment',
              description: `Retainer deposit — invoice ${invoice.invoice_number ?? invoice.id}`,
              createdBy: 'webhook',
            },
            tx
          );

          if (!depositResult.success) {
            logger.error('Failed to record trust deposit for invoice {invoiceId}: {error}', {
              invoiceId: invoice.id,
              matterId: invoice.matter_id,
              organizationId: invoice.organization_id,
              error: depositResult.error.message,
            });
            throw new Error('Failed to record trust deposit');
          }

          // 4b. Sync denormalized cache from ledger balance
          const balanceResult = await trustService.getBalanceWithTx(
            {
              organizationId: invoice.organization_id,
              clientId: matter.client_id,
            },
            tx
          );

          if (!balanceResult.success) {
            logger.error('Failed to get trust balance for invoice {invoiceId}: {error}', {
              invoiceId: invoice.id,
              matterId: invoice.matter_id,
              organizationId: invoice.organization_id,
              error: balanceResult.error.message,
            });
            throw new Error('Failed to get trust balance');
          }

          const matterBalance =
            balanceResult.data.byMatter.find((m) => m.matter_id === invoice.matter_id)?.balance ?? 0;
          await mattersQueries.updateRetainerBalance(invoice.matter_id, matterBalance, tx);

          // 4c. Check low balance threshold
          if (
            matter.retainer_low_balance_threshold !== null &&
            matter.retainer_low_balance_threshold > 0 &&
            matterBalance < matter.retainer_low_balance_threshold
          ) {
            await RetainerLowBalance.dispatch(
              {
                matter_id: matter.id,
                organization_id: matter.organization_id,
                current_balance: matterBalance,
                threshold: matter.retainer_low_balance_threshold,
              },
              {
                actorId: 'webhook',
                actorType: 'webhook',
                organizationId: invoice.organization_id,
                tx,
                critical: true,
              }
            );
          }
        } else if (matter) {
          // Fallback: matter exists but no client_id - just update retainer_balance directly
          const newBalance = matter.retainer_balance + stripeInvoice.amount_paid;

          await mattersQueries.updateRetainerBalance(invoice.matter_id, newBalance, tx);
        }
      } else if (invoice.matter_id && invoice.payment_from_retainer) {
        // Handle payment from retainer (decrement balance)
        const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
        if (matter?.client_id) {
          // Record withdrawal in trust ledger
          const withdrawalResult = await trustService.recordWithdrawal(
            {
              organizationId: invoice.organization_id,
              clientId: matter.client_id,
              matterId: invoice.matter_id,
              amount: stripeInvoice.amount_paid,
              invoiceId: invoice.id,
              stripePaymentIntentId: paymentIntentId,
              source: 'invoice_payment',
              description: `Invoice payment from retainer — invoice ${invoice.invoice_number ?? invoice.id}`,
              createdBy: 'webhook',
            },
            tx
          );

          if (!withdrawalResult.success) {
            logger.error('Failed to record trust withdrawal for invoice {invoiceId}: {error}', {
              invoiceId: invoice.id,
              matterId: invoice.matter_id,
              organizationId: invoice.organization_id,
              error: withdrawalResult.error.message,
            });
            throw new Error('Failed to record trust withdrawal');
          }

          // Sync denormalized cache from ledger balance
          const balanceResult = await trustService.getBalanceWithTx(
            {
              organizationId: invoice.organization_id,
              clientId: matter.client_id,
            },
            tx
          );

          if (!balanceResult.success) {
            logger.error('Failed to get trust balance for invoice {invoiceId}: {error}', {
              invoiceId: invoice.id,
              matterId: invoice.matter_id,
              organizationId: invoice.organization_id,
              error: balanceResult.error.message,
            });
            throw new Error('Failed to get trust balance');
          }

          const matterBalance =
            balanceResult.data.byMatter.find((m) => m.matter_id === invoice.matter_id)?.balance ?? 0;
          await mattersQueries.updateRetainerBalance(invoice.matter_id, matterBalance, tx);

          // Check low balance threshold
          if (
            matter.retainer_low_balance_threshold !== null &&
            matter.retainer_low_balance_threshold > 0 &&
            matterBalance < matter.retainer_low_balance_threshold
          ) {
            await RetainerLowBalance.dispatch(
              {
                matter_id: matter.id,
                organization_id: matter.organization_id,
                current_balance: matterBalance,
                threshold: matter.retainer_low_balance_threshold,
              },
              {
                actorId: 'webhook',
                actorType: 'webhook',
                organizationId: invoice.organization_id,
                tx,
                critical: true,
              }
            );
          }
        } else if (matter) {
          // Fallback: matter exists but no client_id - just decrement retainer_balance directly
          const newBalance = Math.max(0, matter.retainer_balance - stripeInvoice.amount_paid);

          await mattersQueries.updateRetainerBalance(invoice.matter_id, newBalance, tx);
        }
      }

      await InvoicePaid.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          matter_id: invoice.matter_id,
          stripe_invoice_id: stripeInvoice.id,
          amount_paid: stripeInvoice.amount_paid,
          retainer_deducted: !!invoice.payment_from_retainer,
          retainer_amount_deducted: invoice.payment_from_retainer ? stripeInvoice.amount_paid : undefined,
          metered_fee_cents: meteredFeeCents,
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
          critical: true,
        }
      );
    });

    logger.info('✅ Invoice {invoiceId} marked as paid', { invoiceId: invoice.id });
    return result.ok<void>(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.paid {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    return result.internalError<void>('Failed to handle invoice.paid webhook');
  }
};

/**
 * Handle invoice.payment_failed event
 */
const handleInvoicePaymentFailed = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      return result.ok<void>(undefined);
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'overdue',
        },
        tx
      );

      await InvoicePaymentFailed.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          stripe_invoice_id: stripeInvoice.id,
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
        }
      );
    });

    logger.info('❌ Payment failed for invoice {invoiceId}', { invoiceId: invoice.id });
    return result.ok<void>(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    return result.internalError<void>('Failed to handle invoice webhook');
  }
};

/**
 * Handle invoice.voided event
 */
const handleInvoiceVoided = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      return result.ok<void>(undefined);
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'cancelled',
        },
        tx
      );

      await InvoiceVoided.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          stripe_invoice_id: stripeInvoice.id,
          voided_by: 'webhook',
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
        }
      );
    });

    logger.info('🚫 Invoice {invoiceId} voided', { invoiceId: invoice.id });
    return result.ok<void>(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    return result.internalError<void>('Failed to handle invoice webhook');
  }
};

/**
 * Handle invoice.deleted event (for draft invoices)
 */
const handleInvoiceDeleted = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      return result.ok<void>(undefined);
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.softDeleteInvoice(invoice.id, invoice.organization_id, null, tx);

      await InvoiceDeleted.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          deleted_by: 'webhook',
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
        }
      );
    });

    logger.info('🗑️ Invoice {invoiceId} deleted via Stripe', { invoiceId: invoice.id });
    return result.ok<void>(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    return result.internalError<void>('Failed to handle invoice webhook');
  }
};

/**
 * Type guard for Stripe Invoice
 */
const isStripeInvoice = (obj: unknown): obj is Stripe.Invoice =>
  obj !== null && typeof obj === 'object' && 'object' in obj && obj.object === 'invoice';
/**
 * Process a Stripe invoice event
 */
const processEvent = async (event: Stripe.Event): Promise<Result<void>> => {
  const eventType = event.type;
  const stripeInvoice = event.data.object;

  if (!isStripeInvoice(stripeInvoice)) {
    logger.warn('Received Stripe event without invoice object: {eventType}', { eventType });
    return result.ok<void>(undefined);
  }

  logger.info('Processing invoice webhook event {eventType} for Stripe Invoice {stripeInvoiceId}', {
    eventType,
    stripeInvoiceId: stripeInvoice.id,
  });

  switch (eventType) {
    case 'invoice.paid':
      return await handleInvoicePaid(stripeInvoice);
    case 'invoice.payment_failed':
      return await handleInvoicePaymentFailed(stripeInvoice);
    case 'invoice.voided':
      return await handleInvoiceVoided(stripeInvoice);
    case 'invoice.deleted':
      return await handleInvoiceDeleted(stripeInvoice);
    default:
      logger.info('Unhandled invoice event type: {eventType}', { eventType });
      return result.ok<void>(undefined);
  }
};

/**
 * Invoice Webhooks Service
 *
 * Processes Stripe invoice-related webhook events.
 */
export const invoiceWebhooksService = {
  processEvent,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleInvoiceVoided,
  handleInvoiceDeleted,
};
