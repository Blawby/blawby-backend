import type {
  listClientsRoute,
  createClientRoute,
  getClientRoute,
  updateClientRoute,
  deleteClientRoute,
  listClientMemosRoute,
  createClientMemoRoute,
  updateClientMemoRoute,
  deleteClientMemoRoute,
} from '@/modules/clients/routes';
import { clientMemosService } from '@/modules/clients/services/client-memos.service';
import { clientsService } from '@/modules/clients/services/clients.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const listClientsHandler: AppRouteHandler<typeof listClientsRoute> = async (c) => {
  const { practiceId: organizationId } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await clientsService.listClients({
    organizationId: organizationId,
    ...query,
  });

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, result.data);
};

export const createClientHandler: AppRouteHandler<typeof createClientRoute> = async (c) => {
  const { practiceId: organizationId } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientsService.createClient(organizationId, body, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { data: result.data });
};

export const getClientHandler: AppRouteHandler<typeof getClientRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');

  const result = await clientsService.getClient(uuid, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const updateClientHandler: AppRouteHandler<typeof updateClientRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientsService.updateClient(uuid, organizationId, body, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteClientHandler: AppRouteHandler<typeof deleteClientRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');
  const user = c.get('user')!;

  const result = await clientsService.deleteClient(uuid, organizationId, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};

// ==================== MEMOS ====================

export const listClientMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');

  const result = await clientMemosService.listMemos(uuid, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const createClientMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientMemosService.createMemo(uuid, organizationId, {
    ...body,
    event_time: body.event_time ? new Date(body.event_time) : undefined,
  }, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { data: result.data });
};

export const updateClientMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { practiceId: organizationId, uuid, memoId } = c.req.valid('param');
  const body = c.req.valid('json');

  const result = await clientMemosService.updateMemo(memoId, uuid, organizationId, body);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteClientMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { practiceId: organizationId, uuid, memoId } = c.req.valid('param');

  const result = await clientMemosService.deleteMemo(memoId, uuid, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};
