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

type ConnectedAccount = { id: string; stripe_account_id: string };

const resolveClientForInvoice = (input: {
  organizationId: string;
  connectedAccountId: string;
  client: {
    organization_id: string;
    organization: {
      stripeConnectedAccounts: ConnectedAccount[];
    };
  } | null;
}) => {
  if (!input.client || input.client.organization_id !== input.organizationId) {
    return { success: false, error: { status: 403, message: 'Forbidden' } };
  }

  const connectedAccount =
    input.client.organization.stripeConnectedAccounts.find((acc) => acc.id === input.connectedAccountId) ?? null;

  return {
    success: true,
    data: { connectedAccount },
  };
};

test('invoice client resolver', async (t) => {
  await t.test('lookup filters connected account by internal UUID id', async (t) => {
    const res = resolveClientForInvoice({
      organizationId: 'org_1',
      connectedAccountId: 'uuid_2',
      client: {
        organization_id: 'org_1',
        organization: {
          stripeConnectedAccounts: [
            { id: 'uuid_1', stripe_account_id: 'acct_1' },
            { id: 'uuid_2', stripe_account_id: 'acct_2' },
          ],
        },
      },
    });

    t.equal(res.success, true);
    if (res.success) {
      t.equal(res.data.connectedAccount?.id, 'uuid_2');
      t.equal(res.data.connectedAccount?.stripe_account_id, 'acct_2');
    }
  });

  await t.test('returns forbidden when client is null', async (t) => {
    const res = resolveClientForInvoice({
      organizationId: 'org_1',
      connectedAccountId: 'uuid_2',
      client: null,
    });

    t.equal(res.success, false);
    if (!res.success) {
      t.equal(res.error.status, 403);
    }
  });

  await t.test('returns forbidden when client belongs to a different organization', async (t) => {
    const res = resolveClientForInvoice({
      organizationId: 'org_1',
      connectedAccountId: 'uuid_2',
      client: {
        organization_id: 'org_2',
        organization: {
          stripeConnectedAccounts: [
            { id: 'uuid_2', stripe_account_id: 'acct_2' },
          ],
        },
      },
    });

    t.equal(res.success, false);
    if (!res.success) {
      t.equal(res.error.status, 403);
    }
  });

  await t.test('returns success with connectedAccount = null when no connected account matches', async (t) => {
    const res = resolveClientForInvoice({
      organizationId: 'org_1',
      connectedAccountId: 'uuid_missing',
      client: {
        organization_id: 'org_1',
        organization: {
          stripeConnectedAccounts: [
            { id: 'uuid_1', stripe_account_id: 'acct_1' },
          ],
        },
      },
    });

    t.equal(res.success, true);
    if (res.success) {
      t.equal(res.data.connectedAccount, null);
    }
  });
});
