import type Stripe from 'stripe';
import {
  ExternalAccountSchema,
  ExternalAccountsSchema,
} from '@/modules/onboarding/types/onboarding.types';
import type {
  ExternalAccount,
  ExternalAccounts,
} from '@/modules/onboarding/types/onboarding.types';

/**
 * Type guards for Stripe and Onboarding types
 * Optimized to use Zod schemas where applicable for guaranteed runtime safety.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isExternalAccountList = (value: unknown): value is ExternalAccounts => {
  return ExternalAccountsSchema.safeParse(value).success;
};

const isExternalAccountItem = (value: unknown): value is ExternalAccount => {
  return ExternalAccountSchema.safeParse(value).success;
};

const isStripeExternalAccountList = (
  value: unknown,
): value is { object: 'list'; data: Stripe.ExternalAccount[] } => {
  if (!isRecord(value)) return false;
  return value.object === 'list' && Array.isArray(value.data);
};

const isBankAccount = (
  account: Stripe.ExternalAccount,
): account is Stripe.BankAccount => {
  return account.object === 'bank_account';
};

const isCardAccount = (
  account: Stripe.ExternalAccount,
): account is Stripe.Card => {
  return account.object === 'card';
};

export const stripeTypeGuards = {
  isBankAccount,
  isCardAccount,
  isExternalAccountItem,
  isExternalAccountList,
  isRecord,
  isStripeExternalAccountList,
};
