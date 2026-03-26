import { relations } from 'drizzle-orm';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [clients.organization_id],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [clients.user_id],
    references: [users.id],
    relationName: 'user',
  }),
  intake: one(practiceClientIntakes, {
    fields: [clients.intake_id],
    references: [practiceClientIntakes.id],
  }),
  address: one(addresses, {
    fields: [clients.address_id],
    references: [addresses.id],
  }),
  deletedByUser: one(users, {
    fields: [clients.deleted_by],
    references: [users.id],
    relationName: 'deletedBy',
  }),
  invoices: many(invoices),
  matters: many(matters),
}));
