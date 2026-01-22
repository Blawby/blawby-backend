import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Matter time entry validation schemas
const createMatterTimeEntrySchema = z.object({
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  description: z.string().optional(),
  billable: z.boolean().default(true),
});

const updateMatterTimeEntrySchema = z.object({
  startTime: z.iso.datetime().optional(),
  endTime: z.iso.datetime().optional(),
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
  matterId: z.uuid(),
  userId: z.uuid(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  duration: z.number().describe('Duration in seconds'),
  description: z.string().nullable(),
  billable: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).openapi('TimeEntry');



export const matterTimeEntryValidations = {
  createMatterTimeEntrySchema,
  updateMatterTimeEntrySchema,
  matterTimeEntryIdParamSchema,
  timeEntrySchema,
};
