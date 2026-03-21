import { relations } from 'drizzle-orm';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { userDetails } from '@/modules/user-details/database/schema/user-details.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const userDetailsRelations = relations(userDetails, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [userDetails.organization_id],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [userDetails.user_id],
    references: [users.id],
    relationName: 'user',
  }),
  intake: one(practiceClientIntakes, {
    fields: [userDetails.intake_id],
    references: [practiceClientIntakes.id],
  }),
  address: one(addresses, {
    fields: [userDetails.address_id],
    references: [addresses.id],
  }),
  deletedByUser: one(users, {
    fields: [userDetails.deleted_by],
    references: [users.id],
    relationName: 'deletedBy',
  }),
  invoices: many(invoices),
  matters: many(matters),
}));
