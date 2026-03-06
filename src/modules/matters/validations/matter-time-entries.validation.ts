import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Matter time entry validation schemas
const createMatterTimeEntrySchema = z.object({
  start_time: z.iso.datetime(),
  end_time: z.iso.datetime(),
  description: z.string().optional(),
  billable: z.boolean().default(true),
});

const updateMatterTimeEntrySchema = z.object({
  start_time: z.iso.datetime().optional(),
  end_time: z.iso.datetime().optional(),
  description: z.string().optional(),
  billable: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' },
);

const matterTimeEntryIdParamSchema = z.object({
  id: uuidValidator,
  entry_id: uuidValidator.openapi({
    param: { name: 'entry_id', in: 'path' },
    description: 'Time Entry ID (UUID)',
  }),
});

const listTimeEntriesQuerySchema = z.object({
  entry_id: uuidValidator.optional(),
  billable: z.coerce.boolean().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

const timeEntrySchema = z.object({
  id: z.uuid(),
  matter_id: z.uuid(),
  user_id: z.uuid(),
  start_time: z.date(),
  end_time: z.date(),
  duration: z.number().describe('Duration in seconds'),
  description: z.string().nullable(),
  billable: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
}).openapi('TimeEntry');


export const matterTimeEntryValidations = {
  createMatterTimeEntrySchema,
  updateMatterTimeEntrySchema,
  matterTimeEntryIdParamSchema,
  listTimeEntriesQuerySchema,
  timeEntrySchema,
};
