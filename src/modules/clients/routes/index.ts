import {
  listClientsRoute,
  getClientRoute,
  updateClientRoute,
  deleteClientRoute,
} from '@/modules/clients/routes/clients.routes';
import {
  listClientMemosRoute,
  createClientMemoRoute,
  updateClientMemoRoute,
  deleteClientMemoRoute,
} from '@/modules/clients/routes/client-memos.routes';
import {
  getClientIntakeProfileRoute,
  updateClientIntakeProfileRoute,
} from '@/modules/clients/routes/client-intake-profile.routes';

export const routes = {
  listClientsRoute,
  getClientRoute,
  updateClientRoute,
  deleteClientRoute,
  listClientMemosRoute,
  createClientMemoRoute,
  updateClientMemoRoute,
  deleteClientMemoRoute,
  getClientIntakeProfileRoute,
  updateClientIntakeProfileRoute,
};
