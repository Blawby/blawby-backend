import { test } from 'tap';

// NOTE: These are logic harness tests, not full module integration tests.
// t.mockImport against the real service modules is blocked by transitive
// side-effectful imports (DB, Stripe, app-config) that initialise at module
// load time before mock interception can occur.
// Full integration test coverage for these services is tracked separately
// and requires either dependency injection refactoring in the services
// or a dedicated test DB + Stripe test mode environment.
// What these tests verify: behavioral contracts, status transitions,
// field mappings, and error handling logic.

type InvoiceRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  matter_id: string;
  total: number;
  invoice_type: 'flat_fee' | 'retainer_deposit';
  payment_from_retainer: boolean;
  connected_account_acct_id: string;
};

type StripeInvoiceLike = {
  amount_paid: number;
  latest_charge: string | null;
  charge: string | null;
  payment_intent: string | null;
};

const VARIABLE_FEE_RATE = 0.01337;

const handleInvoicePaid = async (
  invoice: InvoiceRecord,
  stripeInvoice: StripeInvoiceLike,
  deps: {
    updateInvoice: (patch: Record<string, unknown>) => Promise<void>;
    createTransfer: (params: Record<string, unknown>) => Promise<{ id: string }>;
    incrementRetainerBalance: () => Promise<void>;
    decrementRetainerBalance: () => Promise<void>;
    recordDeposit: () => Promise<void>;
    recordWithdrawal: () => Promise<void>;
    retrieveBalanceTransactionFee: (chargeId: string) => Promise<number>;
    reportMeteredUsage: (amountCents: number) => Promise<void>;
    logWarning: (message: string) => void;
  },
) => {
  const chargeId = stripeInvoice.latest_charge ?? stripeInvoice.charge ?? null;
  const paymentIntentId = stripeInvoice.payment_intent;

  await deps.updateInvoice({
    stripe_charge_id: chargeId,
    stripe_payment_intent_id: paymentIntentId,
  });

  const transfer = await deps.createTransfer({
    amount: stripeInvoice.amount_paid,
    destination: invoice.connected_account_acct_id,
  });
  await deps.updateInvoice({
    stripe_transfer_id: transfer.id,
  });

  if (invoice.invoice_type === 'retainer_deposit') {
    await deps.incrementRetainerBalance();
    await deps.recordDeposit();
  }

  if (invoice.payment_from_retainer) {
    await deps.decrementRetainerBalance();
    await deps.recordWithdrawal();
  }

  const variableFee = Math.round(invoice.total * VARIABLE_FEE_RATE);
  let stripeFee = 0;
  if (chargeId) {
    try {
      stripeFee = await deps.retrieveBalanceTransactionFee(chargeId);
    } catch {
      deps.logWarning('Failed to fetch Stripe balance transaction fee');
    }
  }
  await deps.reportMeteredUsage(stripeFee + variableFee);
};

test('invoice webhook paid handler', async (t) => {
  const baseInvoice: InvoiceRecord = {
    id: 'inv_1',
    organization_id: 'org_1',
    client_id: 'client_1',
    matter_id: 'matter_1',
    total: 10000,
    invoice_type: 'flat_fee',
    payment_from_retainer: false,
    connected_account_acct_id: 'acct_123',
  };

  const baseStripeInvoice: StripeInvoiceLike = {
    amount_paid: 10000,
    latest_charge: 'ch_latest',
    charge: 'ch_legacy',
    payment_intent: 'pi_123',
  };

  await t.test('sets charge/payment intent, transfers full amount, stores transfer id, reports metered fee', async (t) => {
    const patches: Record<string, unknown>[] = [];
    let transferParams: Record<string, unknown> | null = null;
    let meteredAmount = 0;

    await handleInvoicePaid(baseInvoice, baseStripeInvoice, {
      updateInvoice: async (patch) => {
        patches.push(patch);
      },
      createTransfer: async (params) => {
        transferParams = params;
        return { id: 'tr_1' };
      },
      incrementRetainerBalance: async () => undefined,
      decrementRetainerBalance: async () => undefined,
      recordDeposit: async () => undefined,
      recordWithdrawal: async () => undefined,
      retrieveBalanceTransactionFee: async () => 450,
      reportMeteredUsage: async (amountCents) => {
        meteredAmount = amountCents;
      },
      logWarning: () => undefined,
    });

    t.ok(patches.some((p) => p.stripe_charge_id === 'ch_latest'));
    t.ok(patches.some((p) => p.stripe_payment_intent_id === 'pi_123'));
    t.ok(patches.some((p) => p.stripe_transfer_id === 'tr_1'));

    t.equal(transferParams?.amount, 10000);
    t.equal(transferParams?.destination, 'acct_123');
    t.equal(Object.prototype.hasOwnProperty.call(transferParams ?? {}, 'application_fee_amount'), false);
    t.equal(meteredAmount, 450 + Math.round(10000 * 0.01337));
  });

  await t.test('uses charge as fallback when latest_charge is null', async (t) => {
    const patches: Record<string, unknown>[] = [];

    await handleInvoicePaid(baseInvoice, { ...baseStripeInvoice, latest_charge: null, charge: 'ch_fallback' }, {
      updateInvoice: async (patch) => {
        patches.push(patch);
      },
      createTransfer: async () => ({ id: 'tr_1' }),
      incrementRetainerBalance: async () => undefined,
      decrementRetainerBalance: async () => undefined,
      recordDeposit: async () => undefined,
      recordWithdrawal: async () => undefined,
      retrieveBalanceTransactionFee: async () => 0,
      reportMeteredUsage: async () => undefined,
      logWarning: () => undefined,
    });

    t.ok(patches.some((p) => p.stripe_charge_id === 'ch_fallback'));
  });

  await t.test('retainer deposit calls recordDeposit + increment', async (t) => {
    let incrementCalled = 0;
    let depositCalled = 0;

    await handleInvoicePaid({ ...baseInvoice, invoice_type: 'retainer_deposit' }, baseStripeInvoice, {
      updateInvoice: async () => undefined,
      createTransfer: async () => ({ id: 'tr_1' }),
      incrementRetainerBalance: async () => {
        incrementCalled++;
      },
      decrementRetainerBalance: async () => undefined,
      recordDeposit: async () => {
        depositCalled++;
      },
      recordWithdrawal: async () => undefined,
      retrieveBalanceTransactionFee: async () => 0,
      reportMeteredUsage: async () => undefined,
      logWarning: () => undefined,
    });

    t.equal(incrementCalled, 1);
    t.equal(depositCalled, 1);
  });

  await t.test('payment from retainer calls recordWithdrawal + decrement', async (t) => {
    let decrementCalled = 0;
    let withdrawalCalled = 0;

    await handleInvoicePaid({ ...baseInvoice, payment_from_retainer: true }, baseStripeInvoice, {
      updateInvoice: async () => undefined,
      createTransfer: async () => ({ id: 'tr_1' }),
      incrementRetainerBalance: async () => undefined,
      decrementRetainerBalance: async () => {
        decrementCalled++;
      },
      recordDeposit: async () => undefined,
      recordWithdrawal: async () => {
        withdrawalCalled++;
      },
      retrieveBalanceTransactionFee: async () => 0,
      reportMeteredUsage: async () => undefined,
      logWarning: () => undefined,
    });

    t.equal(decrementCalled, 1);
    t.equal(withdrawalCalled, 1);
  });

  await t.test('if balance tx fetch throws, does not throw and uses fallback fee', async (t) => {
    let warned = 0;
    let meteredAmount = 0;

    await handleInvoicePaid(baseInvoice, baseStripeInvoice, {
      updateInvoice: async () => undefined,
      createTransfer: async () => ({ id: 'tr_1' }),
      incrementRetainerBalance: async () => undefined,
      decrementRetainerBalance: async () => undefined,
      recordDeposit: async () => undefined,
      recordWithdrawal: async () => undefined,
      retrieveBalanceTransactionFee: async () => {
        throw new Error('boom');
      },
      reportMeteredUsage: async (amountCents) => {
        meteredAmount = amountCents;
      },
      logWarning: () => {
        warned++;
      },
    });

    t.equal(warned, 1);
    t.equal(meteredAmount, Math.round(10000 * 0.01337));
  });
});
