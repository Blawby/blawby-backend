import { trustReadinessQueries } from '@/modules/trust/database/queries/trust-readiness.queries';
import { trustReconciliationsRepository } from '@/modules/trust/database/queries/trust-reconciliations.queries';
import { trustTransactionsRepository } from '@/modules/trust/database/queries/trust-transactions.queries';
import type { SelectTrustReconciliation } from '@/modules/trust/database/schema/trust-reconciliations.schema';
import type {
  TrustReadinessResponse,
  TrustReconciliationInput,
  TrustReconciliationResponse,
  TrustRetainerTarget,
} from '@/modules/trust/types/trust-readiness.types';
import { uow } from '@/shared/database/uow';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

interface LedgerBalanceSource {
  client_id: string;
  matter_id: string | null;
  balance: number;
  as_of_date: Date;
}

interface RetainerTargetSource {
  client_id: string | null;
  matter_id: string;
  target_balance: number | null;
}

const serializeReconciliation = (row: SelectTrustReconciliation): TrustReconciliationResponse => {
  if (row.status !== 'balanced' && row.status !== 'variance') {
    throw new Error(`Invalid trust reconciliation status: ${row.status}`);
  }
  if (row.source !== 'manual_statement' && row.source !== 'bank_integration') {
    throw new Error(`Invalid trust reconciliation source: ${row.source}`);
  }
  return {
    ...row,
    status: row.status,
    source: row.source,
    statement_ending_at: row.statement_ending_at.toISOString(),
    created_at: row.created_at.toISOString(),
  };
};

const calculateReconciliation = ({
  bankStatementBalance,
  trustBookBalance,
  clientLedgerBalance,
}: {
  bankStatementBalance: number;
  trustBookBalance: number;
  clientLedgerBalance: number;
}) => {
  const bankToBookVariance = bankStatementBalance - trustBookBalance;
  const bookToClientVariance = trustBookBalance - clientLedgerBalance;
  let status: TrustReconciliationResponse['status'] = 'variance';
  if (bankToBookVariance === 0 && bookToClientVariance === 0) {
    status = 'balanced';
  }
  return {
    bankToBookVariance,
    bookToClientVariance,
    status,
  };
};

const getLedgerSnapshot = (balances: readonly LedgerBalanceSource[]) => ({
  clientLedgerBalance: balances.reduce((sum, row) => sum + row.balance, 0),
  asOfAt: balances.reduce<Date | null>(
    (latest, row) => (!latest || row.as_of_date > latest ? row.as_of_date : latest),
    null
  ),
});

const buildRetainerTargets = (
  targets: readonly RetainerTargetSource[],
  balances: readonly LedgerBalanceSource[]
): TrustRetainerTarget[] => {
  const balanceByMatter = new Map(balances.filter((row) => row.matter_id).map((row) => [row.matter_id, row.balance]));
  return targets.flatMap((target) => {
    if (!target.client_id || target.target_balance === null) {
      return [];
    }
    const currentBalance = balanceByMatter.get(target.matter_id) ?? 0;
    const fundedPercent =
      target.target_balance === 0 ? 100 : Math.max(0, Math.round((currentBalance / target.target_balance) * 100));
    const status: TrustRetainerTarget['status'] = currentBalance >= target.target_balance ? 'funded' : 'low';
    return [
      {
        client_id: target.client_id,
        matter_id: target.matter_id,
        current_balance: currentBalance,
        target_balance: target.target_balance,
        funded_percent: fundedPercent,
        status,
      },
    ];
  });
};

const ensureIdempotentMatch = (row: SelectTrustReconciliation, data: TrustReconciliationInput): void => {
  const matches =
    row.statement_ending_at.getTime() === new Date(data.statement_ending_at).getTime() &&
    row.bank_statement_balance === data.bank_statement_balance &&
    row.trust_book_balance === data.trust_book_balance &&
    row.notes === (data.notes ?? null);
  if (!matches) {
    throw new HTTPException(409, { message: 'Idempotency key was already used for a different reconciliation' });
  }
};

const reconcile = async (
  { data }: { data: TrustReconciliationInput },
  ctx: ServiceContext
): Promise<TrustReconciliationResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('manage', 'Trust');

  return uow.transaction(async () => {
    const existing = await trustReconciliationsRepository.findByIdempotencyKey(
      ctx.organizationId,
      data.idempotency_key
    );
    if (existing) {
      ensureIdempotentMatch(existing, data);
      return serializeReconciliation(existing);
    }

    const balances = await trustTransactionsRepository.getLatestBalancePerClientMatter(ctx.organizationId);
    const { clientLedgerBalance } = getLedgerSnapshot(balances);
    const calculation = calculateReconciliation({
      bankStatementBalance: data.bank_statement_balance,
      trustBookBalance: data.trust_book_balance,
      clientLedgerBalance,
    });
    const row = await trustReconciliationsRepository.createIdempotent({
      organization_id: ctx.organizationId,
      idempotency_key: data.idempotency_key,
      statement_ending_at: new Date(data.statement_ending_at),
      bank_statement_balance: data.bank_statement_balance,
      trust_book_balance: data.trust_book_balance,
      client_ledger_balance: clientLedgerBalance,
      bank_to_book_variance: calculation.bankToBookVariance,
      book_to_client_variance: calculation.bookToClientVariance,
      status: calculation.status,
      source: 'manual_statement',
      notes: data.notes ?? null,
      created_by: ctx.userId,
    });
    ensureIdempotentMatch(row, data);
    return serializeReconciliation(row);
  });
};

const listReconciliations = async (
  { limit }: { limit: number },
  ctx: ServiceContext
): Promise<TrustReconciliationResponse[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  const rows = await trustReconciliationsRepository.listByOrganization(ctx.organizationId, limit);
  return rows.map(serializeReconciliation);
};

const getReadiness = async (_params: Record<string, never>, ctx: ServiceContext): Promise<TrustReadinessResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Trust');
  const [balances, latestReconciliation, targets] = await Promise.all([
    trustTransactionsRepository.getLatestBalancePerClientMatter(ctx.organizationId),
    trustReconciliationsRepository.getLatest(ctx.organizationId),
    trustReadinessQueries.listRetainerTargets(ctx.organizationId),
  ]);
  const snapshot = getLedgerSnapshot(balances);
  let bankSource: TrustReadinessResponse['boundaries']['bank_source'] = 'not_configured';
  if (latestReconciliation?.source === 'bank_integration') {
    bankSource = 'bank_integration';
  } else if (latestReconciliation) {
    bankSource = 'manual_statement';
  }

  return {
    ledger: {
      client_ledger_balance: snapshot.clientLedgerBalance,
      as_of_at: snapshot.asOfAt?.toISOString() ?? null,
    },
    latest_reconciliation: latestReconciliation ? serializeReconciliation(latestReconciliation) : null,
    retainer_targets: buildRetainerTargets(targets, balances),
    boundaries: {
      bank_source: bankSource,
      operating_account_status: 'not_connected',
      invoice_receivables_included: false,
      operating_revenue_included: false,
    },
  };
};

export const trustReadinessService = { reconcile, listReconciliations, getReadiness };

export { buildRetainerTargets, calculateReconciliation, ensureIdempotentMatch, getLedgerSnapshot };
