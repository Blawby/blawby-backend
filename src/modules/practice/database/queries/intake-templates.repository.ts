import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  intakeTemplates,
  intakeTemplateFields,
  type IntakeTemplate,
  type IntakeTemplateField,
  type InsertIntakeTemplate,
  type InsertIntakeTemplateField,
} from '@/modules/practice/database/schema/intake-templates.schema';
import { getActiveTx } from '@/shared/database/uow';

type TemplateWithFields = IntakeTemplate & { fields: IntakeTemplateField[] };

const withFields = async (template: IntakeTemplate): Promise<TemplateWithFields> => {
  const fields = await getActiveTx()
    .select()
    .from(intakeTemplateFields)
    .where(eq(intakeTemplateFields.template_id, template.id))
    .orderBy(asc(intakeTemplateFields.order_index));
  return { ...template, fields };
};

const findById = async (id: string): Promise<TemplateWithFields | undefined> => {
  const [template] = await getActiveTx().select().from(intakeTemplates).where(eq(intakeTemplates.id, id)).limit(1);
  if (!template) return undefined;
  return withFields(template);
};

const findByOrganization = async (organizationId: string): Promise<TemplateWithFields[]> => {
  const templates = await getActiveTx()
    .select()
    .from(intakeTemplates)
    .where(eq(intakeTemplates.organization_id, organizationId));
  if (templates.length === 0) return [];

  const allFields = await getActiveTx()
    .select()
    .from(intakeTemplateFields)
    .where(
      inArray(
        intakeTemplateFields.template_id,
        templates.map((t) => t.id)
      )
    )
    .orderBy(asc(intakeTemplateFields.order_index));

  const fieldsByTemplateId = new Map<string, IntakeTemplateField[]>();
  for (const field of allFields) {
    const existing = fieldsByTemplateId.get(field.template_id) ?? [];
    existing.push(field);
    fieldsByTemplateId.set(field.template_id, existing);
  }

  return templates.map((t) => ({ ...t, fields: fieldsByTemplateId.get(t.id) ?? [] }));
};

const findPublishedDefaultByOrganization = async (organizationId: string): Promise<TemplateWithFields | undefined> => {
  const [template] = await getActiveTx()
    .select()
    .from(intakeTemplates)
    .where(
      and(
        eq(intakeTemplates.organization_id, organizationId),
        eq(intakeTemplates.is_default, true),
        eq(intakeTemplates.status, 'published')
      )
    )
    .limit(1);
  if (!template) return undefined;
  return withFields(template);
};

const create = async (data: InsertIntakeTemplate, fields: InsertIntakeTemplateField[]): Promise<TemplateWithFields> => {
  const [template] = await getActiveTx().insert(intakeTemplates).values(data).returning();
  if (!template) throw new Error('Failed to insert intake template');

  const insertedFields =
    fields.length > 0
      ? await getActiveTx()
          .insert(intakeTemplateFields)
          .values(fields.map((f) => ({ ...f, template_id: template.id })))
          .returning()
      : [];

  return { ...template, fields: insertedFields };
};

const update = async (
  id: string,
  data: Partial<InsertIntakeTemplate>,
  fields?: InsertIntakeTemplateField[]
): Promise<TemplateWithFields> => {
  const [template] = await getActiveTx()
    .update(intakeTemplates)
    .set({ ...data, updated_at: new Date() })
    .where(eq(intakeTemplates.id, id))
    .returning();
  if (!template) throw new Error('Failed to update intake template');

  if (fields !== undefined) {
    await getActiveTx().delete(intakeTemplateFields).where(eq(intakeTemplateFields.template_id, id));
    const insertedFields =
      fields.length > 0
        ? await getActiveTx()
            .insert(intakeTemplateFields)
            .values(fields.map((f) => ({ ...f, template_id: id })))
            .returning()
        : [];
    return { ...template, fields: insertedFields };
  }

  const existingFields = await getActiveTx()
    .select()
    .from(intakeTemplateFields)
    .where(eq(intakeTemplateFields.template_id, id))
    .orderBy(asc(intakeTemplateFields.order_index));
  return { ...template, fields: existingFields };
};

const clearDefaultForOrganization = async (organizationId: string): Promise<void> => {
  await getActiveTx()
    .update(intakeTemplates)
    .set({ is_default: false, updated_at: new Date() })
    .where(and(eq(intakeTemplates.organization_id, organizationId), eq(intakeTemplates.is_default, true)));
};

const remove = async (id: string): Promise<void> => {
  await getActiveTx().delete(intakeTemplates).where(eq(intakeTemplates.id, id));
};

export const intakeTemplatesRepository = {
  findById,
  findByOrganization,
  findPublishedDefaultByOrganization,
  create,
  update,
  clearDefaultForOrganization,
  remove,
};
