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
  uuid: uuidValidator,
  entryId: uuidValidator,
});

const timeEntrySchema = z.object({
  id: z.uuid(),
  matter_id: z.uuid(),
  user_id: z.uuid(),
  start_time: z.iso.datetime(),
  end_time: z.iso.datetime(),
  duration: z.number().describe('Duration in seconds'),
  description: z.string().nullable(),
  billable: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
}).openapi('TimeEntry');


export const matterTimeEntryValidations = {
  createMatterTimeEntrySchema,
  updateMatterTimeEntrySchema,
  matterTimeEntryIdParamSchema,
  timeEntrySchema,
};
