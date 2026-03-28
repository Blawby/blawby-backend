import type {
  listClientsRoute,
  getClientRoute,
  updateClientRoute as updateClientRouteType,
  deleteClientRoute as deleteClientRouteType,
  listClientMemosRoute,
  createClientMemoRoute,
  updateClientMemoRoute,
  deleteClientMemoRoute,
} from '@/modules/clients/routes';
import { clientMemosService } from '@/modules/clients/services/client-memos.service';
import { clientsMutationService } from '@/modules/clients/services/clients-mutation.service';
import { clientsQueriesService } from '@/modules/clients/services/clients-queries.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

export const listClientsHandler: AppRouteHandler<typeof listClientsRoute> = async (c) => {
  const query = c.req.valid('query');
  const ctx = getServiceContext(c);

  const clients = await clientsQueriesService.listClients(query, ctx);
  return c.json(clients, 200);
};

export const getClientHandler: AppRouteHandler<typeof getClientRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const client = await clientsQueriesService.getClient({ id }, ctx);
  return c.json(client, 200);
};

export const updateClientHandler: AppRouteHandler<typeof updateClientRouteType> = async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const client = await clientsMutationService.updateClient({ id, data: body }, ctx);
  return c.json(client, 200);
};

export const deleteClientHandler: AppRouteHandler<typeof deleteClientRouteType> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  await clientsMutationService.deleteClient({ id }, ctx);
  return c.body(null, 204);
};

// ==================== MEMOS ====================

export const listClientMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { id: clientId } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const memos = await clientMemosService.listMemos({ clientId }, ctx);
  return c.json(memos, 200);
};

export const createClientMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
  const { id: clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const memo = await clientMemosService.createMemo(
    {
      clientId,
      data: {
        ...body,
        event_time: body.event_time ? new Date(body.event_time) : undefined,
      },
    },
    ctx
  );

  return c.json(memo, 201);
};

export const updateClientMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { id: clientId, memo_id: id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const memo = await clientMemosService.updateMemo(
    {
      id,
      clientId,
      data: {
        ...body,
        event_time: body.event_time ? new Date(body.event_time) : undefined,
      },
    },
    ctx
  );

  return c.json(memo, 200);
};

export const deleteClientMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { id: clientId, memo_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  await clientMemosService.deleteMemo({ id, clientId }, ctx);
  return c.body(null, 204);
};
