import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { StripeConnectedAccount } from '@/modules/onboarding/schemas/onboarding.schema';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

/**
 * Validates that a Stripe connected account is ready for charges and payouts
 */
export const validateConnectedAccount = (
  account: StripeConnectedAccount | null | undefined,
): Result<void> => {
  if (!account) {
    return result.badRequest('Invalid connected account ID');
  }

  if (!account.charges_enabled) {
    return result.badRequest(
      'Stripe Connect account is not enabled for charges. Please complete onboarding first.',
    );
  }

  if (!account.payouts_enabled) {
    return result.badRequest(
      'Stripe Connect account is not enabled for payouts. Please complete onboarding and add a bank account.',
    );
  }

  return result.ok(undefined);
};

/**
 * Validates that a matter belongs to the specified client
 */
export const validateMatterBelongsToClient = (
  matter: SelectMatter | null | undefined,
  clientId: string,
): Result<void> => {
  if (!matter) {
    return result.notFound('Matter not found');
  }

  if (matter.client_id !== clientId) {
    return result.badRequest('Matter does not belong to the selected client');
  }

  return result.ok(undefined);
};

/**
 * Validates that an invoice number is unique within an organization
 */
export const validateInvoiceNumberUnique = async (
  organizationId: string,
  invoiceNumber: string | undefined | null,
): Promise<Result<void>> => {
  const normalizedInvoiceNumber = invoiceNumber?.trim();
  // If no invoice number provided, skip uniqueness check (Stripe will assign one)
  if (!normalizedInvoiceNumber) return result.ok(undefined);

  const existingInvoice = await db.query.invoices.findFirst({
    where: (invoices, { and, eq }) => and(
      eq(invoices.organization_id, organizationId),
      eq(invoices.invoice_number, normalizedInvoiceNumber),
    ),
  });

  if (existingInvoice) {
    return result.badRequest(`Invoice number '${invoiceNumber}' already exists`);
  }

  return result.ok(undefined);
};

export const invoiceValidators = {
  validateConnectedAccount,
  validateMatterBelongsToClient,
  validateInvoiceNumberUnique,
};
