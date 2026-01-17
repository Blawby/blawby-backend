import type Stripe from 'stripe';

import type { ExternalAccount, ExternalAccounts } from '@/modules/onboarding/schemas/onboarding.schema';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isExternalAccountList = (value: unknown): value is ExternalAccounts => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.object !== 'list') {
    return false;
  }
  return Array.isArray(value.data);
};

const isExternalAccountItem = (value: unknown): value is ExternalAccount => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === 'string' && typeof value.object === 'string';
};

const isStripeExternalAccountList = (
  value: unknown,
): value is { object: 'list'; data: Stripe.ExternalAccount[] } => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.object !== 'list') {
    return false;
  }
  return Array.isArray(value.data);
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
