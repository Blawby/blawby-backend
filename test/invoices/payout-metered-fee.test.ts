import { test } from 'tap';
import { payoutMeteredFeeService } from '@/modules/invoices/services/payout-metered-fee.service';

const chargeWithFee = (fee: number) => ({ balance_transaction: { fee } });

void test('payout metered fee calculation', async (suite) => {
  await suite.test('adds the Stripe fee to the variable platform fee', async (assert) => {
    const calls: { chargeId: string; stripeAccountId: string | null }[] = [];

    const result = await payoutMeteredFeeService.calculateMeteredFeeCents(
      { amountPaid: 10_000, chargeId: 'ch_123', stripeAccountId: 'acct_123' },
      {
        retrieveCharge: async (chargeId, stripeAccountId) => {
          calls.push({ chargeId, stripeAccountId });
          return chargeWithFee(320);
        },
      }
    );

    assert.equal(result, 454);
    assert.same(calls, [{ chargeId: 'ch_123', stripeAccountId: 'acct_123' }]);
  });

  await suite.test('uses the variable fee when no charge is available', async (assert) => {
    let retrieved = false;
    const result = await payoutMeteredFeeService.calculateMeteredFeeCents(
      { amountPaid: 10_000, chargeId: null, stripeAccountId: null },
      {
        retrieveCharge: async () => {
          retrieved = true;
          return chargeWithFee(320);
        },
      }
    );

    assert.equal(result, 134);
    assert.equal(retrieved, false);
  });

  await suite.test('throws when Stripe retrieval fails so the worker can retry', async (assert) => {
    await assert.rejects(
      payoutMeteredFeeService.calculateMeteredFeeCents(
        { amountPaid: 10_000, chargeId: 'ch_123', stripeAccountId: null },
        {
          retrieveCharge: async () => {
            throw new Error('Stripe unavailable');
          },
        }
      ),
      /Stripe unavailable/
    );
  });
});
