import type Stripe from 'stripe';

import type {
  Capabilities,
  CompanyInfo,
  ExternalAccount,
  ExternalAccounts,
  FutureRequirements,
  IndividualInfo,
  OnboardingAddress,
  Requirements,
  TosAcceptance,
} from '@/modules/onboarding/schemas/onboarding.schema';
import { stripeTypeGuards } from '@/modules/onboarding/utils/stripeTypeGuards';

const normalizeAddress = (
  address: Stripe.Address | null | undefined,
): OnboardingAddress | undefined => {
  if (!address) {
    return undefined;
  }
  return {
    line1: address.line1 ?? undefined,
    line2: address.line2 ?? undefined,
    city: address.city ?? undefined,
    state: address.state ?? undefined,
    postal_code: address.postal_code ?? undefined,
    country: address.country ?? undefined,
  };
};

const normalizeCompany = (
  company: Stripe.Account['company'],
): CompanyInfo | undefined => {
  if (!company) {
    return undefined;
  }
  return {
    name: company.name ?? undefined,
    tax_id: 'tax_id' in company && typeof company.tax_id === 'string'
      ? company.tax_id
      : undefined,
    address: normalizeAddress(company.address),
  };
};

const normalizeIndividual = (
  individual: Stripe.Account['individual'],
): IndividualInfo | undefined => {
  if (!individual) {
    return undefined;
  }
  return {
    first_name: individual.first_name ?? undefined,
    last_name: individual.last_name ?? undefined,
    email: individual.email ?? undefined,
    dob: individual.dob
      ? {
        day: individual.dob.day ?? undefined,
        month: individual.dob.month ?? undefined,
        year: individual.dob.year ?? undefined,
      }
      : undefined,
    ssn_last_4: 'ssn_last_4' in individual && typeof individual.ssn_last_4 === 'string'
      ? individual.ssn_last_4
      : undefined,
    address: normalizeAddress(individual.address),
  };
};

const normalizeRequirements = (
  requirements: Stripe.Account['requirements'],
): Requirements | undefined => {
  if (!requirements) {
    return undefined;
  }
  return {
    currently_due: requirements.currently_due ?? [],
    eventually_due: requirements.eventually_due ?? [],
    past_due: requirements.past_due ?? [],
    pending_verification: requirements.pending_verification ?? [],
    current_deadline: requirements.current_deadline ?? null,
    disabled_reason: requirements.disabled_reason ?? null,
  };
};

const normalizeCapabilities = (
  capabilities: Stripe.Account['capabilities'],
): Capabilities | undefined => {
  if (!capabilities) {
    return undefined;
  }
  const entries = Object.entries(capabilities);
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      normalized[key] = value;
    }
  }
  return normalized;
};

const normalizeExternalAccount = (
  externalAccount: Stripe.ExternalAccount,
): ExternalAccount => {
  const bankAccount = stripeTypeGuards.isBankAccount(externalAccount)
    ? externalAccount
    : undefined;
  const cardAccount = stripeTypeGuards.isCardAccount(externalAccount)
    ? externalAccount
    : undefined;
  return {
    id: externalAccount.id,
    object: externalAccount.object,
    account: typeof externalAccount.account === 'string' ? externalAccount.account : undefined,
    account_holder_name: bankAccount?.account_holder_name ?? undefined,
    account_holder_type: bankAccount?.account_holder_type ?? undefined,
    bank_name: bankAccount?.bank_name ?? undefined,
    country: externalAccount.country ?? undefined,
    currency: externalAccount.currency ?? undefined,
    default_for_currency: externalAccount.default_for_currency ?? undefined,
    fingerprint: externalAccount.fingerprint ?? undefined,
    last_4: bankAccount?.last4 ?? cardAccount?.last4,
    metadata: externalAccount.metadata ?? undefined,
    routing_number: bankAccount?.routing_number ?? undefined,
    status: externalAccount.status ?? undefined,
  };
};

const normalizeExternalAccounts = (
  externalAccounts: Stripe.Account['external_accounts'],
): ExternalAccounts | undefined => {
  if (!externalAccounts) {
    return undefined;
  }
  if (stripeTypeGuards.isStripeExternalAccountList(externalAccounts)) {
    return {
      object: 'list',
      data: externalAccounts.data.map(normalizeExternalAccount),
    };
  }
  return undefined;
};

const normalizeFutureRequirements = (
  requirements: Stripe.Account['future_requirements'],
): FutureRequirements | undefined => {
  if (!requirements) {
    return undefined;
  }
  return {
    currently_due: requirements.currently_due ?? [],
    eventually_due: requirements.eventually_due ?? [],
    past_due: requirements.past_due ?? [],
    pending_verification: requirements.pending_verification ?? [],
    current_deadline: requirements.current_deadline ?? null,
    disabled_reason: requirements.disabled_reason ?? null,
  };
};

const normalizeTosAcceptance = (
  tosAcceptance: Stripe.Account['tos_acceptance'],
): TosAcceptance | undefined => {
  if (!tosAcceptance) {
    return undefined;
  }
  return {
    date: tosAcceptance.date ?? undefined,
    ip: tosAcceptance.ip ?? undefined,
    user_agent: tosAcceptance.user_agent ?? undefined,
  };
};

export const stripeAccountNormalizers = {
  normalizeCapabilities,
  normalizeCompany,
  normalizeExternalAccounts,
  normalizeFutureRequirements,
  normalizeIndividual,
  normalizeRequirements,
  normalizeTosAcceptance,
};
