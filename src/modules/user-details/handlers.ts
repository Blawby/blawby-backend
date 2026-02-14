import type {
  listUserDetailsRoute as listClientsRoute,
  getUserDetailRoute as getClientRoute,
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
  const { practiceId: organizationId } = c.req.valid('param');
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

export const getUserDetailHandler: AppRouteHandler<typeof getClientRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');

  const result = await clientsService.getUserDetail(uuid, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const updateUserDetailsHandler: AppRouteHandler<typeof updateClientRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');
  const body = c.req.valid('json');
  const user = c.get('user')!;

  const result = await clientsService.updateUserDetails(uuid, organizationId, body, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteUserDetailHandler: AppRouteHandler<typeof deleteClientRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');
  const user = c.get('user')!;

  const result = await clientsService.deleteUserDetail(uuid, organizationId, user.id);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};

// ==================== MEMOS ====================

export const listUserDetailsMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { practiceId: organizationId, uuid } = c.req.valid('param');

  const result = await clientMemosService.listMemos(uuid, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const createUserDetailMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
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

export const updateUserDetailMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { practiceId: organizationId, uuid, memoId } = c.req.valid('param');
  const body = c.req.valid('json');

  const result = await clientMemosService.updateMemo(memoId, uuid, organizationId, body);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { data: result.data });
};

export const deleteUserDetailMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { practiceId: organizationId, uuid, memoId } = c.req.valid('param');

  const result = await clientMemosService.deleteMemo(memoId, uuid, organizationId);

  if (!result.success) {
    return response.fromResult(c, result);
  }

  return response.ok(c, { success: true });
};
