import { intakeTemplateSuggestionsRepository } from '@/modules/practice/database/queries/intake-template-suggestions.repository';
import { intakeTemplatesRepository } from '@/modules/practice/database/queries/intake-templates.repository';
import type { InsertIntakeTemplateField } from '@/modules/practice/database/schema/intake-templates.schema';
import {
  intakeTemplateValidations,
  type CreateIntakeTemplateSuggestionRequest,
  type IntakeTemplateProposedEdit,
  type IntakeTemplateResponse,
  type IntakeTemplateSuggestionResponse,
} from '@/modules/practice/validations/intake-templates.validation';
import { uow } from '@/shared/database/uow';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

const unavailableAnalytics = {
  status: 'unavailable',
  window: null,
  numerator: null,
  denominator: null,
  provenance: 'practice_client_intakes',
  reason: 'Intake submissions do not yet record template revision attribution.',
} as const;

const isSameRequest = (
  suggestion: IntakeTemplateSuggestionResponse,
  templateId: string,
  data: CreateIntakeTemplateSuggestionRequest
): boolean =>
  suggestion.template_id === templateId &&
  suggestion.base_revision === data.base_revision &&
  suggestion.instruction === data.instruction &&
  JSON.stringify(suggestion.proposed_edits) === JSON.stringify(data.proposed_edits);

const toSuggestionResponse = (
  suggestion: Awaited<ReturnType<typeof intakeTemplateSuggestionsRepository.findById>>
): IntakeTemplateSuggestionResponse => {
  if (!suggestion) {
    throw new Error('Suggestion is null');
  }
  const proposedEdits = intakeTemplateValidations.intakeTemplateProposedEditSchema
    .array()
    .parse(suggestion.proposed_edits);
  const analyticsEvidence = intakeTemplateValidations.analyticsEvidenceSchema.parse(suggestion.analytics_evidence);
  return {
    ...suggestion,
    proposed_edits: proposedEdits,
    analytics_evidence: analyticsEvidence,
    created_at: suggestion.created_at.toISOString(),
    decided_at: suggestion.decided_at?.toISOString() ?? null,
  };
};

const applyEdits = (
  fields: InsertIntakeTemplateField[],
  edits: IntakeTemplateProposedEdit[],
  templateId: string
): InsertIntakeTemplateField[] => {
  let next = fields.map((field) => ({ ...field, template_id: templateId }));
  for (const edit of edits) {
    const index = next.findIndex((field) => field.key === edit.field_key);
    if (edit.operation === 'add') {
      if (index >= 0) {
        throw new HTTPException(422, { message: `Field '${edit.field_key}' already exists` });
      }
      next.push({ ...edit.field, key: edit.field_key, template_id: templateId });
    } else {
      const current = next[index];
      if (!current) {
        throw new HTTPException(422, { message: `Field '${edit.field_key}' does not exist` });
      }
      if (edit.operation === 'remove') {
        next = next.filter((field) => field.key !== edit.field_key);
      } else if (edit.operation === 'reorder') {
        next[index] = { ...current, order_index: edit.changes.order_index };
      } else if (edit.operation === 'rephrase') {
        next[index] = { ...current, ...edit.changes };
      } else {
        next[index] = { ...current, ...edit.changes };
      }
    }
  }
  return next
    .sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0))
    .map((field, orderIndex) => ({ ...field, order_index: orderIndex }));
};

const stageSuggestion = async (
  {
    organizationId,
    templateId,
    data,
  }: { organizationId: string; templateId: string; data: CreateIntakeTemplateSuggestionRequest },
  ctx: ServiceContext
): Promise<IntakeTemplateSuggestionResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'IntakeTemplate');
  const template = await intakeTemplatesRepository.findById(templateId);
  if (!template || template.organization_id !== organizationId) {
    throw new HTTPException(404, { message: 'Intake template not found' });
  }

  const existing = await intakeTemplateSuggestionsRepository.findByRequestKey(organizationId, data.request_key);
  if (existing) {
    const response = toSuggestionResponse(existing);
    if (!isSameRequest(response, templateId, data)) {
      throw new HTTPException(409, { message: 'Suggestion request key was reused with different content' });
    }
    return response;
  }
  if (template.revision !== data.base_revision) {
    throw new HTTPException(409, { message: 'Intake template revision conflict' });
  }

  applyEdits(template.fields, data.proposed_edits, templateId);
  const suggestion = await intakeTemplateSuggestionsRepository.create({
    organization_id: organizationId,
    template_id: templateId,
    request_key: data.request_key,
    base_revision: data.base_revision,
    instruction: data.instruction,
    proposed_edits: data.proposed_edits,
    analytics_evidence: unavailableAnalytics,
    created_by: ctx.userId,
  });
  const response = toSuggestionResponse(suggestion);
  if (!isSameRequest(response, templateId, data)) {
    throw new HTTPException(409, { message: 'Suggestion request key was reused with different content' });
  }
  return response;
};

const listSuggestions = async (
  { organizationId, templateId }: { organizationId: string; templateId: string },
  ctx: ServiceContext
): Promise<{ suggestions: IntakeTemplateSuggestionResponse[] }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'IntakeTemplate');
  const template = await intakeTemplatesRepository.findById(templateId);
  if (!template || template.organization_id !== organizationId) {
    throw new HTTPException(404, { message: 'Intake template not found' });
  }
  const suggestions = await intakeTemplateSuggestionsRepository.listByTemplate(organizationId, templateId);
  return { suggestions: suggestions.map(toSuggestionResponse) };
};

const approveSuggestion = async (
  {
    organizationId,
    templateId,
    suggestionId,
    expectedRevision,
  }: { organizationId: string; templateId: string; suggestionId: string; expectedRevision: number },
  ctx: ServiceContext
): Promise<{ suggestion: IntakeTemplateSuggestionResponse; template: IntakeTemplateResponse }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'IntakeTemplate');
  try {
    return await uow.transaction(async () => {
      const suggestion = await intakeTemplateSuggestionsRepository.findById(organizationId, suggestionId);
      if (!suggestion || suggestion.template_id !== templateId) {
        throw new HTTPException(404, { message: 'Intake template suggestion not found' });
      }
      const template = await intakeTemplatesRepository.findById(templateId);
      if (!template || template.organization_id !== organizationId) {
        throw new HTTPException(404, { message: 'Intake template not found' });
      }
      if (suggestion.status === 'approved') {
        return { suggestion: toSuggestionResponse(suggestion), template: toTemplateResponse(template) };
      }
      if (suggestion.status !== 'staged') {
        throw new HTTPException(409, { message: 'Suggestion is no longer staged' });
      }
      if (template.revision !== expectedRevision || suggestion.base_revision !== expectedRevision) {
        throw new HTTPException(409, { message: 'Intake template revision conflict' });
      }
      const proposedEdits = intakeTemplateValidations.intakeTemplateProposedEditSchema
        .array()
        .parse(suggestion.proposed_edits);
      const fields = applyEdits(template.fields, proposedEdits, templateId);
      const updated = await intakeTemplatesRepository.update(templateId, {}, fields, expectedRevision);
      const approved = await intakeTemplateSuggestionsRepository.markApproved(
        suggestionId,
        ctx.userId,
        updated.revision
      );
      return { suggestion: toSuggestionResponse(approved), template: toTemplateResponse(updated) };
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'INTAKE_TEMPLATE_REVISION_CONFLICT') {
      throw error;
    }
    const [suggestion, template] = await Promise.all([
      intakeTemplateSuggestionsRepository.findById(organizationId, suggestionId),
      intakeTemplatesRepository.findById(templateId),
    ]);
    if (suggestion?.status === 'approved' && template?.organization_id === organizationId) {
      return { suggestion: toSuggestionResponse(suggestion), template: toTemplateResponse(template) };
    }
    throw new HTTPException(409, { message: 'Intake template revision conflict', cause: error });
  }
};

const dismissSuggestion = async (
  { organizationId, templateId, suggestionId }: { organizationId: string; templateId: string; suggestionId: string },
  ctx: ServiceContext
): Promise<IntakeTemplateSuggestionResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'IntakeTemplate');
  const suggestion = await intakeTemplateSuggestionsRepository.findById(organizationId, suggestionId);
  if (!suggestion || suggestion.template_id !== templateId) {
    throw new HTTPException(404, { message: 'Intake template suggestion not found' });
  }
  if (suggestion.status === 'dismissed') {
    return toSuggestionResponse(suggestion);
  }
  if (suggestion.status !== 'staged') {
    throw new HTTPException(409, { message: 'Approved suggestions cannot be dismissed' });
  }
  return toSuggestionResponse(await intakeTemplateSuggestionsRepository.markDismissed(suggestionId, ctx.userId));
};

const toTemplateResponse = (
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
    archived_at: template.archived_at?.toISOString() ?? null,
    published_at: template.published_at?.toISOString() ?? null,
    created_at: template.created_at.toISOString(),
    updated_at: template.updated_at.toISOString(),
    fields: template.fields.map((field) => ({
      ...field,
      placeholder: field.placeholder ?? null,
      help_text: field.help_text ?? null,
      prompt_hint: field.prompt_hint ?? null,
      validation_rules: field.validation_rules ?? null,
      options: field.options ?? null,
      created_at: field.created_at.toISOString(),
      updated_at: field.updated_at.toISOString(),
    })),
  };
};

export const intakeTemplateSuggestionsService = {
  stageSuggestion,
  listSuggestions,
  approveSuggestion,
  dismissSuggestion,
};
