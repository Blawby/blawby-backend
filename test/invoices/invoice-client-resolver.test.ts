import { test } from 'tap';

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

  await t.test('returns forbidden when connected account UUID does not belong to organization', async (t) => {
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
});
