import { z } from '@hono/zod-openapi';
import { DEADLINE_TYPES } from '@/modules/matters/database/schema/matter-deadlines.schema';

const deadlineTypeSchema = z.enum(DEADLINE_TYPES);

const createMatterDeadlineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  date: z.iso.date(),
  type: deadlineTypeSchema,
  source: z.string().optional(),
  alert_days_before: z.array(z.int().positive()).default([]),
});

const updateMatterDeadlineSchema = z
  .object({
    name: z.string().min(1).optional(),
    date: z.iso.date().optional(),
    type: deadlineTypeSchema.optional(),
    source: z.string().nullable().optional(),
    alert_days_before: z.array(z.int().positive()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided for update' });

const deadlineResponseSchema = z
  .object({
    id: z.uuid(),
    matter_id: z.uuid(),
    name: z.string(),
    date: z.string(),
    type: deadlineTypeSchema,
    source: z.string().nullable(),
    alert_days_before: z.array(z.number()),
    created_at: z.date(),
    updated_at: z.date(),
  })
  .openapi('MatterDeadline');

export const matterDeadlineValidations = {
  createMatterDeadlineSchema,
  updateMatterDeadlineSchema,
  deadlineResponseSchema,
};
