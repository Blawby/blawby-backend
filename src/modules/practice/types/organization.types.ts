import type { organizations } from '@/schema/better-auth-schema';

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
