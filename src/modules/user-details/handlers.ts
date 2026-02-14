import type {
  listUserDetailsRoute as listClientsRoute,
  updateUserDetailsRoute as updateClientRoute,
  deleteUserDetailRoute as deleteClientRoute,
  listUserDetailsMemosRoute as listClientMemosRoute,
  createUserDetailMemoRoute as createClientMemoRoute,
  updateUserDetailsMemoRoute as updateClientMemoRoute,
  deleteUserDetailsMemoRoute as deleteClientMemoRoute,
} from '@/modules/user-details/routes';
import { clientMemosService } from '@/modules/user-details/services/client-memos.service';
import { userDetailsService as clientsService } from '@/modules/user-details/services/user-details.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const listUserDetailsHandler: AppRouteHandler<typeof listClientsRoute> = async (c) => {
  const { practice_id: organizationId } = c.req.valid('param');
  const query = c.req.valid('query');

  const result = await clientsService.listUserDetails({
    organizationId: organizationId,
    ...query,
  });

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, result.data);
};

// Note: No createUserDetailsHandler - clients are created via intake or invitation flows

export const updateUserDetailsHandler: AppRouteHandler<typeof updateClientRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientsService.updateUserDetails(id, organizationId, body, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteUserDetailHandler: AppRouteHandler<typeof deleteClientRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const user = c.get('user')!;

  const result = await clientsService.deleteUserDetail(id, organizationId, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};

// ==================== MEMOS ====================

export const listUserDetailsMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');

  const result = await clientMemosService.listMemos(id, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const createUserDetailMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
  const { practice_id: organizationId, id } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientMemosService.createMemo(id, organizationId, {
    ...body,
    event_time: body.event_time ? new Date(body.event_time) : undefined,
  }, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.created(c, { data: result.data });
};

export const updateUserDetailMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { practice_id: organizationId, id, memoId } = c.req.valid('param');
  const body = c.req.valid('json');

  const result = await clientMemosService.updateMemo(memoId, id, organizationId, body);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteUserDetailMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { practice_id: organizationId, id, memoId } = c.req.valid('param');

  const result = await clientMemosService.deleteMemo(memoId, id, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};
