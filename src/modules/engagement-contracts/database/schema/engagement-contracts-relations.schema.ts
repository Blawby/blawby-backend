import { relations } from 'drizzle-orm';
import { engagementContracts } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const engagementContractsRelations = relations(engagementContracts, ({ one }) => ({
  intake: one(practiceClientIntakes, {
    fields: [engagementContracts.intake_id],
    references: [practiceClientIntakes.id],
  }),
  matter: one(matters, {
    fields: [engagementContracts.matter_id],
    references: [matters.id],
  }),
  organization: one(organizations, {
    fields: [engagementContracts.organization_id],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [engagementContracts.created_by],
    references: [users.id],
  }),
}));
