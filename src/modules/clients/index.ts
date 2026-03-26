/**
 * Clients Module
 *
 * Client identity and CRM records for law firm clients.
 * This module handles client records which are distinct from user accounts.
 */

// HTTP entry point
export { default as clientsHttp } from './http';

// Services
export { clientsCrudService, clientsService } from './services/clients-crud.service';
export { clientsStripeService } from './services/clients-stripe.service';
export { clientMemosService } from './services/client-memos.service';

// Repository
export { clientsRepository } from './database/queries/clients.queries';
export { practiceClientMemosRepository } from './database/queries/practice-client-memos.queries';

// Schema
export * from './database/schema/clients.schema';
export * from './database/schema/practice-client-memos.schema';

// Types
export type { AddressInput } from './types';

// Listeners
export { registerClientsListeners } from './listeners';
