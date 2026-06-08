import type {
  listClientsRoute,
  getClientRoute,
  updateClientRoute,
  deleteClientRoute,
} from '@/modules/clients/routes/clients.routes';
import type {
  listClientMemosRoute,
  createClientMemoRoute,
  updateClientMemoRoute,
  deleteClientMemoRoute,
} from '@/modules/clients/routes/client-memos.routes';
import type {
  getClientIntakeProfileRoute,
  updateClientIntakeProfileRoute,
} from '@/modules/clients/routes/client-intake-profile.routes';
import { clientIntakeProfilesService } from '@/modules/clients/services/client-intake-profiles.service';
import { clientMemosService } from '@/modules/clients/services/client-memos.service';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

const listClientsHandler: AppRouteHandler<typeof listClientsRoute> = async (c) => {
  const query = c.req.valid('query');
  const ctx = getServiceContext(c);

  const result = await clientsCrudService.listClients(query, ctx);
  return c.json(result);
};

const getClientHandler: AppRouteHandler<typeof getClientRoute> = async (c) => {
  const { client_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await clientsCrudService.getClient({ id }, ctx);
  return c.json(result);
};

const updateClientHandler: AppRouteHandler<typeof updateClientRoute> = async (c) => {
  const { client_id: id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const result = await clientsCrudService.updateClient({ id, data: body }, ctx);
  return c.json(result);
};

const deleteClientHandler: AppRouteHandler<typeof deleteClientRoute> = async (c) => {
  const { client_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  await clientsCrudService.deleteClient({ id }, ctx);
  return c.body(null, 204);
};

const listClientMemosHandler: AppRouteHandler<typeof listClientMemosRoute> = async (c) => {
  const { client_id: clientId } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await clientMemosService.listMemos({ clientId }, ctx);
  return c.json(result);
};

const createClientMemoHandler: AppRouteHandler<typeof createClientMemoRoute> = async (c) => {
  const { client_id: clientId } = c.req.valid('param');
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

const updateClientMemoHandler: AppRouteHandler<typeof updateClientMemoRoute> = async (c) => {
  const { client_id: clientId, memo_id: id } = c.req.valid('param');
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

const deleteClientMemoHandler: AppRouteHandler<typeof deleteClientMemoRoute> = async (c) => {
  const { client_id: clientId, memo_id: id } = c.req.valid('param');
  const ctx = getServiceContext(c);

  await clientMemosService.deleteMemo({ id, clientId }, ctx);
  return c.body(null, 204);
};

const getClientIntakeProfileHandler: AppRouteHandler<typeof getClientIntakeProfileRoute> = async (c) => {
  const { client_id: clientId } = c.req.valid('param');
  const ctx = getServiceContext(c);

  const result = await clientIntakeProfilesService.getProfile({ clientId }, ctx);
  return c.json(result);
};

const updateClientIntakeProfileHandler: AppRouteHandler<typeof updateClientIntakeProfileRoute> = async (c) => {
  const { client_id: clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const ctx = getServiceContext(c);

  const result = await clientIntakeProfilesService.upsertProfile({ clientId, data: body }, ctx);
  return c.json(result);
};

export const handlers = {
  listClientsHandler,
  getClientHandler,
  updateClientHandler,
  deleteClientHandler,
  listClientMemosHandler,
  createClientMemoHandler,
  updateClientMemoHandler,
  deleteClientMemoHandler,
  getClientIntakeProfileHandler,
  updateClientIntakeProfileHandler,
};
