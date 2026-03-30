import type { Stripe } from 'stripe';

export const parseLimit = (value: string | undefined, defaultValue: number): number => {
  if (!value) {
    return defaultValue;
  }
  if (value.toLowerCase() === 'unlimited' || value === '-1') {
    return -1;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

export const extractLimits = (
  metadata: Record<string, string>
): { users: number; invoices_per_month: number; storage_gb: number } => {
  if (metadata.limits) {
    try {
      const parsed = JSON.parse(metadata.limits);
      return {
        users: parsed.users ?? -1,
        invoices_per_month: parsed.invoices_per_month ?? -1,
        storage_gb: parsed.storage_gb ?? 10,
      };
    } catch {
      // Fall through
    }
  }

  return {
    users: parseLimit(metadata.users_limit, -1),
    invoices_per_month: parseLimit(metadata.invoices_limit, -1),
    storage_gb: parseLimit(metadata.storage_gb, 10),
  };
};

export const extractFeatures = (product: Stripe.Product): string[] => {
  if (product.marketing_features && product.marketing_features.length > 0) {
    return product.marketing_features.map((f) => f.name).filter((name): name is string => name !== undefined);
  }

  const metadata = product.metadata || {};

  if (metadata.features) {
    try {
      return JSON.parse(metadata.features);
    } catch {
      // Fall through
    }
  }

  if (metadata.features_list) {
    return metadata.features_list.split(',').map((f) => f.trim());
  }

  return [];
};
