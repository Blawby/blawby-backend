import type { AppContext, AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import { clientsService } from '@/modules/clients/services/clients.service';
import { clientMemosService } from '@/modules/clients/services/client-memos.service';
import type {
  listClientsRoute,
  createClientRoute,
  getClientRoute,
  updateClientRoute,
  deleteClientRoute,
  listClientMemosRoute,
  createClientMemoRoute,
  updateClientMemoRoute,
  deleteClientMemoRoute
} from '@/modules/clients/routes';

export const listClientsHandler: AppRouteHandler<typeof listClientsRoute> = async (c) => {
  const { orgId } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await clientsService.listClients({
    organizationId: orgId,
    ...query
  });

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, result.data);
};

export const createClientHandler: AppRouteHandler<typeof createClientRoute> = async (c) => {
  const { orgId } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientsService.createClient(orgId, body, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { data: result.data });
};

export const getClientHandler: AppRouteHandler<typeof getClientRoute> = async (c) => {
  const { orgId, uuid } = c.req.valid('param');

  const result = await clientsService.getClient(uuid, orgId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const updateClientHandler: AppRouteHandler<typeof updateClientRoute> = async (c) => {
  const { orgId, uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientsService.updateClient(uuid, orgId, body, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteClientHandler: AppRouteHandler<typeof deleteClientRoute> = async (c) => {
  const { orgId, uuid } = c.req.valid('param');
  const user = c.get('user')!;

  const result = await clientsService.deleteClient(uuid, orgId, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};

// ==================== MEMOS ====================

export const listClientMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { orgId, uuid } = c.req.valid('param');

  const result = await clientMemosService.listMemos(uuid, orgId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const createClientMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
  const { orgId, uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientMemosService.createMemo(uuid, orgId, {
    ...body,
    event_time: body.event_time ? new Date(body.event_time) : undefined
  }, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { data: result.data });
};

export const updateClientMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { orgId, uuid, memoId } = c.req.valid('param');
  const body = c.req.valid('json');

  const result = await clientMemosService.updateMemo(memoId, uuid, orgId, body);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteClientMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { orgId, uuid, memoId } = c.req.valid('param');

  const result = await clientMemosService.deleteMemo(memoId, uuid, orgId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};
