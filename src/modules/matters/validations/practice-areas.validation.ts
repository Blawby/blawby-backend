import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Practice area validation schemas
const createPracticeAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().optional(),
});

const updatePracticeAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  description: z.string().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' },
);

const practiceAreaIdParamSchema = z.object({
  uuid: uuidValidator,
});

const practiceAreaSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).openapi('PracticeArea');



export const practiceAreaValidations = {
  createPracticeAreaSchema,
  updatePracticeAreaSchema,
  practiceAreaIdParamSchema,
  practiceAreaSchema,
};
