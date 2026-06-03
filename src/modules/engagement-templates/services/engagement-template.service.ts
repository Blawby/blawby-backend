import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { engagementTemplatesQueries } from '@/modules/engagement-templates/database/queries/engagement-templates.queries';
import type {
  CreateEngagementTemplateRequest,
  EngagementTemplateRecord,
  UpdateEngagementTemplateRequest,
} from '@/modules/engagement-templates/types/engagement-template.types';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['engagement-templates', 'service']);

const assertInPractice = (template: EngagementTemplateRecord, organizationId: string): void => {
  if (template.practice_id !== organizationId) {
    throw new HTTPException(403, { message: 'Unauthorized' });
  }
};

const listEngagementTemplates = async (
  practiceId: string,
  ctx: ServiceContext
): Promise<EngagementTemplateRecord[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Organization');

  return engagementTemplatesQueries.listByPractice(practiceId);
};

const createEngagementTemplate = async (
  { data }: { data: CreateEngagementTemplateRequest },
  ctx: ServiceContext
): Promise<EngagementTemplateRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

  const body = data.body ?? '';
  const publishedAt = body.trim() ? new Date() : null;

  const template = await engagementTemplatesQueries.insert({
    practice_id: ctx.organizationId,
    name: data.name,
    practice_area: data.practice_area ?? '',
    fee_type: data.fee_type ?? 'hourly',
    hourly_rate_cents: data.hourly_rate_cents ?? null,
    flat_fee_cents: data.flat_fee_cents ?? null,
    contingency_pct: data.contingency_pct ?? null,
    retainer_cents: data.retainer_cents ?? null,
    scope_template: data.scope_template ?? '',
    body,
    published_at: publishedAt,
    last_reviewed_at: data.last_reviewed_at ? new Date(data.last_reviewed_at) : null,
  });

  logger.info('Created engagement template', {
    templateId: template.id,
    organizationId: ctx.organizationId,
  });

  return template;
};

const updateEngagementTemplate = async (
  { id, data }: { id: string; data: UpdateEngagementTemplateRequest },
  ctx: ServiceContext
): Promise<EngagementTemplateRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

  const template = await engagementTemplatesQueries.findById(id);
  if (!template) {
    throw new HTTPException(404, { message: 'Engagement template not found' });
  }
  assertInPractice(template, ctx.organizationId);

  const bodyChanged = data.body !== undefined && data.body !== template.body;
  const newBody = data.body ?? template.body;
  const wasEmpty = !template.body.trim();
  const isNowNonEmpty = newBody.trim().length > 0;

  const updates: Partial<typeof template> = {
    ...('name' in data && data.name !== undefined ? { name: data.name } : {}),
    ...('practice_area' in data && data.practice_area !== undefined ? { practice_area: data.practice_area } : {}),
    ...('fee_type' in data && data.fee_type !== undefined ? { fee_type: data.fee_type } : {}),
    ...('hourly_rate_cents' in data ? { hourly_rate_cents: data.hourly_rate_cents ?? null } : {}),
    ...('flat_fee_cents' in data ? { flat_fee_cents: data.flat_fee_cents ?? null } : {}),
    ...('contingency_pct' in data ? { contingency_pct: data.contingency_pct ?? null } : {}),
    ...('retainer_cents' in data ? { retainer_cents: data.retainer_cents ?? null } : {}),
    ...('scope_template' in data && data.scope_template !== undefined ? { scope_template: data.scope_template } : {}),
    ...(data.body !== undefined ? { body: data.body } : {}),
    ...('last_reviewed_at' in data
      ? { last_reviewed_at: data.last_reviewed_at ? new Date(data.last_reviewed_at) : null }
      : {}),
    ...(bodyChanged ? { version: template.version + 1 } : {}),
    ...(wasEmpty && isNowNonEmpty && !template.published_at ? { published_at: new Date() } : {}),
    updated_at: new Date(),
  };

  const updated = await engagementTemplatesQueries.update(id, updates);

  logger.info('Updated engagement template', {
    templateId: id,
    organizationId: ctx.organizationId,
  });

  return updated;
};

const deleteEngagementTemplate = async ({ id }: { id: string }, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Organization');

  const template = await engagementTemplatesQueries.findById(id);
  if (!template) {
    throw new HTTPException(404, { message: 'Engagement template not found' });
  }
  assertInPractice(template, ctx.organizationId);

  await engagementTemplatesQueries.remove(id);

  logger.info('Deleted engagement template', {
    templateId: id,
    organizationId: ctx.organizationId,
  });
};

export const engagementTemplateService = {
  listEngagementTemplates,
  createEngagementTemplate,
  updateEngagementTemplate,
  deleteEngagementTemplate,
};
