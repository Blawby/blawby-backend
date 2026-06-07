import { intakeTemplatesRepository } from '@/modules/practice/database/queries/intake-templates.repository';
import {
  intakeTemplates,
  type InsertIntakeTemplateField,
} from '@/modules/practice/database/schema/intake-templates.schema';
import type {
  CreateIntakeTemplateRequest,
  IntakeTemplateResponse,
  UpdateIntakeTemplateRequest,
} from '@/modules/practice/validations/intake-templates.validation';
import { getActiveTx, uow } from '@/shared/database/uow';
import type { ServiceContext } from '@/shared/types/service-context';
import { wrapDbError } from '@/shared/utils/db-error';
import { ForbiddenError } from '@casl/ability';
import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

const toResponse = (
  template: Awaited<ReturnType<typeof intakeTemplatesRepository.findById>>
): IntakeTemplateResponse => {
  if (!template) {
    throw new Error('Template is null');
  }
  return {
    ...template,
    description: template.description ?? null,
    intro_message: template.intro_message ?? null,
    legal_disclaimer: template.legal_disclaimer ?? null,
    consultation_fee: template.consultation_fee ?? null,
    archived_at: template.archived_at ? template.archived_at.toISOString() : null,
    created_at: template.created_at.toISOString(),
    updated_at: template.updated_at.toISOString(),
    fields: template.fields.map((f) => ({
      ...f,
      placeholder: f.placeholder ?? null,
      help_text: f.help_text ?? null,
      prompt_hint: f.prompt_hint ?? null,
      validation_rules: f.validation_rules ?? null,
      options: f.options ?? null,
      created_at: f.created_at.toISOString(),
      updated_at: f.updated_at.toISOString(),
    })),
  };
};

const listTemplates = async (
  { organizationId }: { organizationId: string },
  ctx: ServiceContext
): Promise<{ templates: IntakeTemplateResponse[] }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'IntakeTemplate');
  const templates = await intakeTemplatesRepository.findByOrganization(organizationId);
  return { templates: templates.map(toResponse) };
};

const getTemplate = async (
  { organizationId, id }: { organizationId: string; id: string },
  ctx: ServiceContext
): Promise<IntakeTemplateResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'IntakeTemplate');
  const template = await intakeTemplatesRepository.findById(id);
  if (!template || template.organization_id !== organizationId) {
    throw new HTTPException(404, { message: 'Intake template not found' });
  }
  return toResponse(template);
};

const createTemplate = async (
  { organizationId, data }: { organizationId: string; data: CreateIntakeTemplateRequest },
  ctx: ServiceContext
): Promise<IntakeTemplateResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'IntakeTemplate');

  const fields: InsertIntakeTemplateField[] = data.fields.map((f, i) => ({
    key: f.key,
    label: f.label,
    field_type: f.field_type,
    phase: f.phase,
    required: f.required,
    order_index: f.order_index ?? i,
    placeholder: f.placeholder,
    help_text: f.help_text,
    prompt_hint: f.prompt_hint,
    is_standard: f.is_standard,
    validation_rules: f.validation_rules ?? null,
    options: f.options ?? null,
    template_id: '',
  }));

  try {
    const template = await uow.transaction(async () => {
      if (data.is_default) {
        await intakeTemplatesRepository.clearDefaultForOrganization(organizationId);
      }
      return intakeTemplatesRepository.create(
        {
          organization_id: organizationId,
          slug: data.slug,
          name: data.name,
          description: data.description,
          status: data.status,
          is_default: data.is_default,
          intro_message: data.intro_message,
          legal_disclaimer: data.legal_disclaimer,
          payment_link_enabled: data.payment_link_enabled,
          consultation_fee: data.consultation_fee,
        },
        fields
      );
    });
    return toResponse(template);
  } catch (err) {
    return wrapDbError(err);
  }
};

const updateTemplate = async (
  { organizationId, id, data }: { organizationId: string; id: string; data: UpdateIntakeTemplateRequest },
  ctx: ServiceContext
): Promise<IntakeTemplateResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'IntakeTemplate');

  const existing = await intakeTemplatesRepository.findById(id);
  if (!existing || existing.organization_id !== organizationId) {
    throw new HTTPException(404, { message: 'Intake template not found' });
  }

  const fields: InsertIntakeTemplateField[] | undefined = data.fields?.map((f, i) => ({
    key: f.key,
    label: f.label,
    field_type: f.field_type,
    phase: f.phase,
    required: f.required,
    order_index: f.order_index ?? i,
    placeholder: f.placeholder,
    help_text: f.help_text,
    prompt_hint: f.prompt_hint,
    is_standard: f.is_standard,
    validation_rules: f.validation_rules ?? null,
    options: f.options ?? null,
    template_id: id,
  }));

  const template = await uow.transaction(async () => {
    if (data.is_default) {
      await intakeTemplatesRepository.clearDefaultForOrganization(organizationId);
    }
    return intakeTemplatesRepository.update(
      id,
      {
        slug: data.slug,
        name: data.name,
        description: data.description,
        status: data.status,
        is_default: data.is_default,
        intro_message: data.intro_message,
        legal_disclaimer: data.legal_disclaimer,
        payment_link_enabled: data.payment_link_enabled,
        consultation_fee: data.consultation_fee,
        ...(data.status === 'archived'
          ? { archived_at: new Date() }
          : data.status !== undefined
            ? { archived_at: null }
            : {}),
      },
      fields
    );
  });

  return toResponse(template);
};

const deleteTemplate = async (
  { organizationId, id }: { organizationId: string; id: string },
  ctx: ServiceContext
): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'IntakeTemplate');

  await uow.transaction(async () => {
    const deleted = await getActiveTx()
      .delete(intakeTemplates)
      .where(
        and(
          eq(intakeTemplates.id, id),
          eq(intakeTemplates.organization_id, organizationId),
          eq(intakeTemplates.is_default, false)
        )
      )
      .returning({ id: intakeTemplates.id });

    if (deleted.length === 0) {
      const [existing] = await getActiveTx()
        .select({ id: intakeTemplates.id })
        .from(intakeTemplates)
        .where(and(eq(intakeTemplates.id, id), eq(intakeTemplates.organization_id, organizationId)))
        .limit(1);

      if (!existing) {
        throw new HTTPException(404, { message: 'Intake template not found' });
      }
      throw new HTTPException(409, { message: 'Cannot delete the default intake template' });
    }
  });
};

const seedDefaultTemplate = async (organizationId: string): Promise<void> => {
  await uow.transaction(async () => {
    await intakeTemplatesRepository.create(
      {
        organization_id: organizationId,
        slug: 'general-consultation',
        name: 'General Consultation Intake',
        description: 'Default intake form for new client consultations',
        status: 'published',
        is_default: true,
        payment_link_enabled: false,
      },
      [
        {
          template_id: '',
          key: 'description',
          label: 'Describe your situation',
          field_type: 'textarea',
          phase: 'required',
          required: true,
          order_index: 0,
          is_standard: true,
        },
        {
          template_id: '',
          key: 'city',
          label: 'City',
          field_type: 'text',
          phase: 'required',
          required: true,
          order_index: 1,
          is_standard: true,
        },
        {
          template_id: '',
          key: 'state',
          label: 'State',
          field_type: 'text',
          phase: 'required',
          required: true,
          order_index: 2,
          is_standard: true,
        },
        {
          template_id: '',
          key: 'urgency',
          label: 'Urgency',
          field_type: 'select',
          phase: 'enrichment',
          required: false,
          order_index: 3,
          is_standard: true,
          options: [
            { value: 'routine', label: 'Routine' },
            { value: 'time_sensitive', label: 'Time Sensitive' },
            { value: 'emergency', label: 'Emergency' },
          ],
        },
        {
          template_id: '',
          key: 'opposing_party',
          label: 'Opposing Party',
          field_type: 'text',
          phase: 'enrichment',
          required: false,
          order_index: 4,
          is_standard: true,
        },
        {
          template_id: '',
          key: 'desired_outcome',
          label: 'Desired Outcome',
          field_type: 'textarea',
          phase: 'enrichment',
          required: false,
          order_index: 5,
          is_standard: true,
        },
        {
          template_id: '',
          key: 'court_date',
          label: 'Court Date',
          field_type: 'date',
          phase: 'enrichment',
          required: false,
          order_index: 6,
          is_standard: true,
        },
        {
          template_id: '',
          key: 'has_documents',
          label: 'Do you have relevant documents?',
          field_type: 'boolean',
          phase: 'enrichment',
          required: false,
          order_index: 7,
          is_standard: true,
        },
        {
          template_id: '',
          key: 'household_size',
          label: 'Household Size',
          field_type: 'number',
          phase: 'enrichment',
          required: false,
          order_index: 8,
          is_standard: true,
        },
      ]
    );
  });
};

export const intakeTemplatesService = {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  seedDefaultTemplate,
};
