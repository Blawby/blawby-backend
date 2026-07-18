import {
  intakeTemplateSuggestions,
  type InsertIntakeTemplateSuggestion,
  type IntakeTemplateSuggestion,
} from '@/modules/practice/database/schema/intake-templates.schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, desc, eq } from 'drizzle-orm';

const findById = async (organizationId: string, id: string): Promise<IntakeTemplateSuggestion | undefined> => {
  const [suggestion] = await getActiveTx()
    .select()
    .from(intakeTemplateSuggestions)
    .where(and(eq(intakeTemplateSuggestions.id, id), eq(intakeTemplateSuggestions.organization_id, organizationId)))
    .limit(1);
  return suggestion;
};

const findByRequestKey = async (
  organizationId: string,
  requestKey: string
): Promise<IntakeTemplateSuggestion | undefined> => {
  const [suggestion] = await getActiveTx()
    .select()
    .from(intakeTemplateSuggestions)
    .where(
      and(
        eq(intakeTemplateSuggestions.organization_id, organizationId),
        eq(intakeTemplateSuggestions.request_key, requestKey)
      )
    )
    .limit(1);
  return suggestion;
};

const listStagedByTemplate = async (organizationId: string, templateId: string): Promise<IntakeTemplateSuggestion[]> =>
  getActiveTx()
    .select()
    .from(intakeTemplateSuggestions)
    .where(
      and(
        eq(intakeTemplateSuggestions.organization_id, organizationId),
        eq(intakeTemplateSuggestions.template_id, templateId),
        eq(intakeTemplateSuggestions.status, 'staged')
      )
    )
    .orderBy(desc(intakeTemplateSuggestions.created_at));

const create = async (data: InsertIntakeTemplateSuggestion): Promise<IntakeTemplateSuggestion> => {
  const [suggestion] = await getActiveTx()
    .insert(intakeTemplateSuggestions)
    .values(data)
    .onConflictDoNothing({
      target: [intakeTemplateSuggestions.organization_id, intakeTemplateSuggestions.request_key],
    })
    .returning();
  if (suggestion) {
    return suggestion;
  }
  const existing = await findByRequestKey(data.organization_id, data.request_key);
  if (!existing) {
    throw new Error('Failed to stage intake template suggestion');
  }
  return existing;
};

const markApproved = async (id: string, userId: string, appliedRevision: number): Promise<IntakeTemplateSuggestion> => {
  const [suggestion] = await getActiveTx()
    .update(intakeTemplateSuggestions)
    .set({ status: 'approved', decided_by: userId, decided_at: new Date(), applied_revision: appliedRevision })
    .where(and(eq(intakeTemplateSuggestions.id, id), eq(intakeTemplateSuggestions.status, 'staged')))
    .returning();
  if (!suggestion) {
    throw new Error('Suggestion is no longer staged');
  }
  return suggestion;
};

const markDismissed = async (id: string, userId: string): Promise<IntakeTemplateSuggestion> => {
  const [suggestion] = await getActiveTx()
    .update(intakeTemplateSuggestions)
    .set({ status: 'dismissed', decided_by: userId, decided_at: new Date() })
    .where(and(eq(intakeTemplateSuggestions.id, id), eq(intakeTemplateSuggestions.status, 'staged')))
    .returning();
  if (!suggestion) {
    throw new Error('Suggestion is no longer staged');
  }
  return suggestion;
};

export const intakeTemplateSuggestionsRepository = {
  findById,
  findByRequestKey,
  listStagedByTemplate,
  create,
  markApproved,
  markDismissed,
};
