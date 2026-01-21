import { z } from 'zod';
import { uuidValidator } from '@/shared/validations/common';

// Practice area validation schemas
export const createPracticeAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().optional(),
});

export const updatePracticeAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  description: z.string().optional(),
}).refine(
  (data) => data.name !== undefined || data.description !== undefined,
  {
    message: 'At least one field must be provided to update',
  },
);

export const practiceAreaIdParamSchema = z.object({
  uuid: uuidValidator,
});

// Infer types
export type CreatePracticeAreaRequest = z.infer<typeof createPracticeAreaSchema>;
export type UpdatePracticeAreaRequest = z.infer<typeof updatePracticeAreaSchema>;
