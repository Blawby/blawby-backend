import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  intakeTemplates,
  intakeTemplateFields,
  type IntakeTemplate,
  type IntakeTemplateField,
  type InsertIntakeTemplate,
  type InsertIntakeTemplateField,
} from '@/modules/practice/database/schema/intake-templates.schema';
import { db } from '@/shared/database';

type TemplateWithFields = IntakeTemplate & { fields: IntakeTemplateField[] };

const withFields = async (template: IntakeTemplate): Promise<TemplateWithFields> => {
  const fields = await db
    .select()
    .from(intakeTemplateFields)
    .where(eq(intakeTemplateFields.template_id, template.id))
    .orderBy(asc(intakeTemplateFields.order_index));
  return { ...template, fields };
};

const findById = async (id: string): Promise<TemplateWithFields | undefined> => {
  const [template] = await db.select().from(intakeTemplates).where(eq(intakeTemplates.id, id)).limit(1);
  if (!template) return undefined;
  return withFields(template);
};

const findByOrganization = async (organizationId: string): Promise<TemplateWithFields[]> => {
  const templates = await db.select().from(intakeTemplates).where(eq(intakeTemplates.organization_id, organizationId));
  if (templates.length === 0) return [];

  const allFields = await db
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

const findDefaultByOrganization = async (organizationId: string): Promise<TemplateWithFields | undefined> => {
  const [template] = await db
    .select()
    .from(intakeTemplates)
    .where(and(eq(intakeTemplates.organization_id, organizationId), eq(intakeTemplates.is_default, true)))
    .limit(1);
  if (!template) return undefined;
  return withFields(template);
};

const findPublishedDefaultByOrganization = async (organizationId: string): Promise<TemplateWithFields | undefined> => {
  const [template] = await db
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

const create = async (
  tx: typeof db,
  data: InsertIntakeTemplate,
  fields: InsertIntakeTemplateField[]
): Promise<TemplateWithFields> => {
  const [template] = await tx.insert(intakeTemplates).values(data).returning();
  if (!template) throw new Error('Failed to insert intake template');

  const insertedFields =
    fields.length > 0
      ? await tx
          .insert(intakeTemplateFields)
          .values(fields.map((f) => ({ ...f, template_id: template.id })))
          .returning()
      : [];

  return { ...template, fields: insertedFields };
};

const update = async (
  tx: typeof db,
  id: string,
  data: Partial<InsertIntakeTemplate>,
  fields?: InsertIntakeTemplateField[]
): Promise<TemplateWithFields> => {
  const [template] = await tx
    .update(intakeTemplates)
    .set({ ...data, updated_at: new Date() })
    .where(eq(intakeTemplates.id, id))
    .returning();
  if (!template) throw new Error('Failed to update intake template');

  if (fields !== undefined) {
    await tx.delete(intakeTemplateFields).where(eq(intakeTemplateFields.template_id, id));
    const insertedFields =
      fields.length > 0
        ? await tx
            .insert(intakeTemplateFields)
            .values(fields.map((f) => ({ ...f, template_id: id })))
            .returning()
        : [];
    return { ...template, fields: insertedFields };
  }

  const existingFields = await db
    .select()
    .from(intakeTemplateFields)
    .where(eq(intakeTemplateFields.template_id, id))
    .orderBy(asc(intakeTemplateFields.order_index));
  return { ...template, fields: existingFields };
};

const clearDefaultForOrganization = async (tx: typeof db, organizationId: string): Promise<void> => {
  await tx
    .update(intakeTemplates)
    .set({ is_default: false, updated_at: new Date() })
    .where(and(eq(intakeTemplates.organization_id, organizationId), eq(intakeTemplates.is_default, true)));
};

const remove = async (id: string): Promise<void> => {
  await db.delete(intakeTemplates).where(eq(intakeTemplates.id, id));
};

export const intakeTemplatesRepository = {
  findById,
  findByOrganization,
  findDefaultByOrganization,
  findPublishedDefaultByOrganization,
  create,
  update,
  clearDefaultForOrganization,
  remove,
};
