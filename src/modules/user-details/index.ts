import userDetailsApp from '@/modules/user-details/http';

export default userDetailsApp;

// Export schemas for migrations
export * from '@/modules/user-details/database/schema/user-details.schema';
export * from '@/modules/user-details/database/schema/practice-client-memos.schema';
