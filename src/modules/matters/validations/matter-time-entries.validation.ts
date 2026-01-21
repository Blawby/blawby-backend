import { z } from 'zod';
import { uuidValidator } from '@/shared/validations/common';

// Matter time entry validation schemas
export const createMatterTimeEntrySchema = z.object({
  startTime: z.string().datetime().or(z.date()),
  endTime: z.string().datetime().or(z.date()),
  description: z.string().optional(),
  billable: z.boolean().default(true),
}).refine(
  (data) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    return end > start;
  },
  {
    message: 'End time must be after start time',
  },
);

export const updateMatterTimeEntrySchema = z.object({
  startTime: z.string().datetime().or(z.date()).optional(),
  endTime: z.string().datetime().or(z.date()).optional(),
  description: z.string().optional(),
  billable: z.boolean().optional(),
});

export const matterTimeEntryIdParamSchema = z.object({
  uuid: uuidValidator,
  entryId: uuidValidator,
});

// Infer types
export type CreateMatterTimeEntryRequest = z.infer<typeof createMatterTimeEntrySchema>;
export type UpdateMatterTimeEntryRequest = z.infer<typeof updateMatterTimeEntrySchema>;
