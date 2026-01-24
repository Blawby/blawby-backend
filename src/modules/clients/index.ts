import clientsApp from '@/modules/clients/http';

export default clientsApp;

// Export schemas for migrations
export * from '@/modules/clients/database/schema/practice-clients.schema';
export * from '@/modules/clients/database/schema/practice-client-memos.schema';
