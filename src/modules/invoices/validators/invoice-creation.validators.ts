import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { StripeConnectedAccount } from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import { HTTPException } from 'hono/http-exception';

/**
 * Validates that a Stripe connected account is ready for charges and payouts
 */
export const validateConnectedAccount = (account: StripeConnectedAccount | null | undefined): void => {
  if (!account) {
    throw new HTTPException(400, { message: 'Invalid connected account ID' });
  }

  if (!account.charges_enabled) {
    throw new HTTPException(400, {
      message: 'Stripe Connect account is not enabled for charges. Please complete onboarding first.',
    });
  }

  if (!account.payouts_enabled) {
    throw new HTTPException(400, {
      message: 'Stripe Connect account is not enabled for payouts. Please complete onboarding and add a bank account.',
    });
  }
};

/**
 * Validates that a matter belongs to the specified client
 */
export const validateMatterBelongsToClient = (matter: SelectMatter | null | undefined, clientId: string): void => {
  if (!matter) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  if (matter.client_id !== clientId) {
    throw new HTTPException(400, { message: 'Matter does not belong to the selected client' });
  }
};

/**
 * Validates that an invoice number is unique within an organization
 */
export const validateInvoiceNumberUnique = async (
  organizationId: string,
  invoiceNumber: string | undefined | null
): Promise<void> => {
  const normalizedInvoiceNumber = invoiceNumber?.trim();
  // If no invoice number provided, skip uniqueness check (Stripe will assign one)
  if (!normalizedInvoiceNumber) {
    return;
  }

  const existingInvoice = await db.query.invoices.findFirst({
    where: (invoices, { and, eq }) =>
      and(eq(invoices.organization_id, organizationId), eq(invoices.invoice_number, normalizedInvoiceNumber)),
  });

  if (existingInvoice) {
    throw new HTTPException(409, { message: `Invoice number '${invoiceNumber}' already exists` });
  }
};

export const invoiceValidators = {
  validateConnectedAccount,
  validateMatterBelongsToClient,
  validateInvoiceNumberUnique,
};
