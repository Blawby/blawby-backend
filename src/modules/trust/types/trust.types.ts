import type { SelectTrustTransaction } from '@/modules/trust/database/schema/trust-transactions.schema';

// Service parameter interfaces
export interface RecordDepositParams {
  organizationId: string;
  clientId: string;
  matterId?: string | null;
  amount: number;
  invoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  source?: string;
  description?: string;
  createdBy: string;
}

export interface RecordWithdrawalParams {
  organizationId: string;
  clientId: string;
  matterId?: string | null;
  amount: number;
  invoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  source?: string;
  description?: string;
  createdBy: string;
}

// Service internal types
export type GetTransactionsParams = {
  organizationId: string;
  clientId?: string;
  matterId?: string;
  startDate?: Date;
  endDate?: Date;
};

export type GetBalanceParams = {
  organizationId: string;
  clientId: string;
};

export type GetReportParams = {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
};

// Re-export schema type
export type { SelectTrustTransaction };
