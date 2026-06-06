import { relations } from 'drizzle-orm';
import { payouts } from '@/modules/payouts/database/schema/payouts.schema';
import { organizations } from '@/schema/better-auth-schema';

export const payoutsRelations = relations(payouts, ({ one }) => ({
  organization: one(organizations, {
    fields: [payouts.organization_id],
    references: [organizations.id],
  }),
}));
