import { test } from 'tap';

type RoutingClaims = {
  workspace_access: {
    practice: boolean;
    client: boolean;
  };
};

const createInvoiceHandler = async (deps: {
  computeRoutingClaims: () => Promise<RoutingClaims>;
  createInvoice: () => Promise<unknown>;
}) => {
  const routing = await deps.computeRoutingClaims();
  if (!routing.workspace_access.practice) {
    return { status: 403, body: { error: 'Forbidden' } };
  }
  await deps.createInvoice();
  return { status: 201, body: { ok: true } };
};

const getClientInvoicesHandler = async (deps: {
  computeRoutingClaims: () => Promise<RoutingClaims>;
  listClientInvoices: () => Promise<unknown>;
}) => {
  const routing = await deps.computeRoutingClaims();
  if (!routing.workspace_access.client) {
    return { status: 403, body: { error: 'Forbidden' } };
  }
  await deps.listClientInvoices();
  return { status: 200, body: { ok: true } };
};

test('invoice authorization handlers', async (t) => {
  await t.test('role=client calling practice invoice endpoint gets 403', async (t) => {
    const called = { value: false };
    const res = await createInvoiceHandler({
      computeRoutingClaims: async () => ({ workspace_access: { practice: false, client: true } }),
      createInvoice: async () => {
        called.value = true;
      },
    });

    t.equal(res.status, 403);
    t.equal(called.value, false);
  });

  await t.test('role=owner with valid entitlement passes through practice endpoint', async (t) => {
    const called = { value: false };
    const res = await createInvoiceHandler({
      computeRoutingClaims: async () => ({ workspace_access: { practice: true, client: false } }),
      createInvoice: async () => {
        called.value = true;
      },
    });

    t.equal(res.status, 201);
    t.equal(called.value, true);
  });

  await t.test('role=owner without entitlement gets 403 on practice endpoint', async (t) => {
    const called = { value: false };
    const res = await createInvoiceHandler({
      computeRoutingClaims: async () => ({ workspace_access: { practice: false, client: false } }),
      createInvoice: async () => {
        called.value = true;
      },
    });

    t.equal(res.status, 403);
    t.equal(called.value, false);
  });

  await t.test('role=client calling client invoice endpoint passes through', async (t) => {
    const called = { value: false };
    const res = await getClientInvoicesHandler({
      computeRoutingClaims: async () => ({ workspace_access: { practice: false, client: true } }),
      listClientInvoices: async () => {
        called.value = true;
      },
    });

    t.equal(res.status, 200);
    t.equal(called.value, true);
  });
});
