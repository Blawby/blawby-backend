import { relations } from 'drizzle-orm';
import { billingTransactions } from '@/modules/invoices/database/schema/billing-transactions.schema';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matterAssignees } from '@/modules/matters/database/schema/matter-assignees.schema';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { practiceServices } from '@/modules/practice/database/schema/practice.schema';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const mattersRelations = relations(matters, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [matters.organization_id],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [matters.client_id],
    references: [clients.id],
  }),
  practiceService: one(practiceServices, {
    fields: [matters.practice_service_id],
    references: [practiceServices.id],
  }),
  deletedByUser: one(users, {
    fields: [matters.deleted_by],
    references: [users.id],
    relationName: 'deletedBy',
  }),
  responsibleAttorney: one(users, {
    fields: [matters.responsible_attorney_id],
    references: [users.id],
    relationName: 'responsibleAttorney',
  }),
  originatingAttorney: one(users, {
    fields: [matters.originating_attorney_id],
    references: [users.id],
    relationName: 'originatingAttorney',
  }),
  assignees: many(matterAssignees),
  milestones: many(matterMilestones),
  invoices: many(invoices),
  billingTransactions: many(billingTransactions),
}));
