import type { z } from '@hono/zod-openapi';
import type { SelectEngagementTemplate } from '@/modules/engagement-templates/database/schema/engagement-templates.schema';
import { engagementTemplateValidations } from '@/modules/engagement-templates/validations/engagement-template.validation';

export const createEngagementTemplateRequestSchema = engagementTemplateValidations.createEngagementTemplateSchema;
export const updateEngagementTemplateRequestSchema = engagementTemplateValidations.updateEngagementTemplateSchema;

export type CreateEngagementTemplateRequest = z.infer<typeof createEngagementTemplateRequestSchema>;
export type UpdateEngagementTemplateRequest = z.infer<typeof updateEngagementTemplateRequestSchema>;
export type EngagementTemplateRecord = SelectEngagementTemplate;
