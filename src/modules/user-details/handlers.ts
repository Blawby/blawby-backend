import type {
  listUserDetailsRoute,
  getUserDetailRoute,
  updateUserDetailsRoute as updateClientRoute,
  deleteUserDetailRoute as deleteClientRoute,
  listUserDetailsMemosRoute as listClientMemosRoute,
  createUserDetailMemoRoute as createClientMemoRoute,
  updateUserDetailsMemoRoute as updateClientMemoRoute,
  deleteUserDetailsMemoRoute as deleteClientMemoRoute,
} from '@/modules/user-details/routes';
import { clientMemosService } from '@/modules/user-details/services/client-memos.service';
import { userDetailsCrudService } from '@/modules/user-details/services/user-details-crud.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';
import { response } from '@/shared/utils/responseUtils';

export const listUserDetailsHandler: AppRouteHandler<typeof listUserDetailsRoute> = async (c) => {
  const query = c.req.valid('query');
  const ctx = getServiceContext(c);

  const result = await userDetailsCrudService.listUserDetails(query, ctx);
  return response.fromResult(c, result);
};

export const getUserDetailHandler: AppRouteHandler<typeof getUserDetailRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await userDetailsCrudService.getUserDetail({ id }, ctx);
  return response.fromResult(c, result);
};

export const updateUserDetailsHandler: AppRouteHandler<typeof updateClientRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const result = await userDetailsCrudService.updateUserDetails({ id, data: body }, ctx);
  return response.fromResult(c, result);
};

export const deleteUserDetailHandler: AppRouteHandler<typeof deleteClientRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await userDetailsCrudService.deleteUserDetail({ id }, ctx);
  return response.fromResult(c, result);
};

// ==================== MEMOS ====================

export const listUserDetailsMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { id: clientId } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await clientMemosService.listMemos({ clientId }, ctx);
  return response.fromResult(c, result);
};

export const createUserDetailMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
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
  return response.fromResult(c, result);
};

export const updateUserDetailMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
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
  return response.fromResult(c, result);
};

export const deleteUserDetailMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { id: clientId, memo_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await clientMemosService.deleteMemo({ id, clientId }, ctx);
  return response.fromResult(c, result);
};
