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
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

export const listClientsHandler: AppRouteHandler<typeof listClientsRoute> = async (c) => {
  const query = c.req.valid('query');
  const ctx = getServiceContext(c);

  const result = await clientsCrudService.listClients(query, ctx);
  return c.json(result);
};

export const getClientHandler: AppRouteHandler<typeof getClientRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await clientsCrudService.getClient({ id }, ctx);
  return c.json(result);
};

export const updateClientHandler: AppRouteHandler<typeof updateClientRouteType> = async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const result = await clientsCrudService.updateClient({ id, data: body }, ctx);
  return c.json(result);
};

export const deleteClientHandler: AppRouteHandler<typeof deleteClientRouteType> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  await clientsCrudService.deleteClient({ id }, ctx);
  return c.body(null, 204);
};

// ==================== MEMOS ====================

export const listClientMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { id: clientId } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await clientMemosService.listMemos({ clientId }, ctx);
  return c.json(result);
};

export const createClientMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
  const { id: clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const result = await clientMemosService.createMemo(
    {
      clientId,
      data: {
        ...body,
        event_time: body.event_time ? new Date(body.event_time) : undefined,
      },
    },
    ctx
  );
  return c.json(result, 201);
};

export const updateClientMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { id: clientId, memo_id: id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const result = await clientMemosService.updateMemo(
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
  return c.json(result);
};

export const deleteClientMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { id: clientId, memo_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  await clientMemosService.deleteMemo({ id, clientId }, ctx);
  return c.body(null, 204);
};
