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
  organizationId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).openapi('PracticeArea');



export const practiceAreaValidations = {
  createPracticeAreaSchema,
  updatePracticeAreaSchema,
  practiceAreaIdParamSchema,
  practiceAreaSchema,
};
