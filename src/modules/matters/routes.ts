import { createRoute, z } from '@hono/zod-openapi';
import { matterExpenseValidations } from '@/modules/matters/validations/matter-expenses.validation';
import { matterMilestoneValidations } from '@/modules/matters/validations/matter-milestones.validation';
import { matterNoteValidations } from '@/modules/matters/validations/matter-notes.validation';
import { matterTimeEntryValidations } from '@/modules/matters/validations/matter-time-entries.validation';
import { matterValidations } from '@/modules/matters/validations/matters.validation';

// Common response schemas
const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.any().optional(),
}).openapi('ErrorResponse');

const notFoundResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
}).openapi('NotFoundResponse');

// Common param schemas
const practiceIdParamSchema = z.object({
  practiceId: z.uuid().openapi({
    param: { name: 'practiceId', in: 'path' },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

const matterUuidParamSchema = z.object({
  practiceId: z.uuid().openapi({
    param: { name: 'practiceId', in: 'path' },
    description: 'Practice ID (UUID)',
  }),
  uuid: z.uuid().openapi({
    param: { name: 'uuid', in: 'path' },
    description: 'Matter ID (UUID)',
  }),
});

// [REMOVED Practice Areas routes - Services are fetched from practice-details]

// ==================== MATTERS ====================

// [REMOVED listMattersRoute - Consolidated into getMatterRoute]

export const createMatterRoute = createRoute({
  method: 'post',
  path: '/{practiceId}/matters',
  tags: ['Matters: General'],
  summary: 'Create matter',
  description: 'Create a new matter/case',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: matterValidations.createMatterSchema,
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ matter: matterValidations.matterSchema }) } }, description: 'Matter created' },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

export const getMatterRoute = createRoute({
  method: 'get',
  path: '/{practiceId}/matters',
  tags: ['Matters: General'],
  summary: 'Get matter(s)',
  description: 'Get all matters or a single matter if matter_uuid query param is provided',
  request: {
    params: practiceIdParamSchema,
    query: matterValidations.listMattersQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.union([
            z.object({ matter: matterValidations.matterSchema }),
            z.object({
              matters: z.array(matterValidations.matterSchema),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
              totalPages: z.number(),
            }),
          ]),
        },
      },
      description: 'Matter(s) retrieved successfully',
    },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Matter not found' },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

export const updateMatterRoute = createRoute({
  method: 'put',
  path: '/{practiceId}/matters/{uuid}',
  tags: ['Matters: General'],
  summary: 'Update matter',
  description: 'Update a matter',
  request: {
    params: matterUuidParamSchema,
    body: {
      content: {
        'application/json': {
          schema: matterValidations.updateMatterSchema,
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ matter: matterValidations.matterSchema }) } }, description: 'Matter updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Matter not found' },
  },
});

export const deleteMatterRoute = createRoute({
  method: 'delete',
  path: '/{practiceId}/matters/{uuid}',
  tags: ['Matters: General'],
  summary: 'Delete matter',
  description: 'Soft delete a matter',
  request: { params: matterUuidParamSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Matter deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Matter not found' },
  },
});

// ==================== MATTER NOTES ====================

export const listMatterNotesRoute = createRoute({
  method: 'get',
  path: '/{practiceId}/matters/{uuid}/notes',
  tags: ['Matters: Notes'],
  summary: 'List notes',
  description: 'Get all notes for a matter',
  request: { params: matterUuidParamSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ notes: z.array(matterNoteValidations.matterNoteSchema) }) } }, description: 'Notes retrieved' },
  },
});

export const createMatterNoteRoute = createRoute({
  method: 'post',
  path: '/{practiceId}/matters/{uuid}/notes',
  tags: ['Matters: Notes'],
  summary: 'Create note',
  description: 'Create a note for a matter',
  request: {
    params: matterUuidParamSchema,
    body: { content: { 'application/json': { schema: matterNoteValidations.createMatterNoteSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ note: matterNoteValidations.matterNoteSchema }) } }, description: 'Note created' },
  },
});

// ==================== TIME ENTRIES ====================

export const listTimeEntriesRoute = createRoute({
  method: 'get',
  path: '/{practiceId}/matters/{uuid}/time-entries',
  tags: ['Matters: Time Entries'],
  summary: 'List time entries',
  description: 'Get all time entries for a matter',
  request: { params: matterUuidParamSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ timeEntries: z.array(matterTimeEntryValidations.timeEntrySchema) }) } }, description: 'Time entries retrieved' },
  },
});

export const createTimeEntryRoute = createRoute({
  method: 'post',
  path: '/{practiceId}/matters/{uuid}/time-entries',
  tags: ['Matters: Time Entries'],
  summary: 'Create time entry',
  description: 'Log time for a matter (duration calculated automatically)',
  request: {
    params: matterUuidParamSchema,
    body: {
      content: {
        'application/json': {
          schema: matterTimeEntryValidations.createMatterTimeEntrySchema,
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ timeEntry: matterTimeEntryValidations.timeEntrySchema }) } }, description: 'Time entry created' },
  },
});

export const getTimeEntryStatsRoute = createRoute({
  method: 'get',
  path: '/{practiceId}/matters/{uuid}/time-entries/stats',
  tags: ['Matters: Time Entries'],
  summary: 'Get time statistics',
  description: 'Get total billable and non-billable time for a matter',
  request: { params: matterUuidParamSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            totalBillableSeconds: z.number(),
            totalSeconds: z.number(),
            totalBillableHours: z.number(),
            totalHours: z.number(),
          }),
        },
      },
      description: 'Statistics retrieved',
    },
  },
});

// ==================== EXPENSES ====================

export const listExpensesRoute = createRoute({
  method: 'get',
  path: '/{practiceId}/matters/{uuid}/expenses',
  tags: ['Matters: Expenses'],
  summary: 'List expenses',
  description: 'Get all expenses for a matter',
  request: { params: matterUuidParamSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ expenses: z.array(matterExpenseValidations.expenseSchema) }) } }, description: 'Expenses retrieved' },
  },
});

export const createExpenseRoute = createRoute({
  method: 'post',
  path: '/{practiceId}/matters/{uuid}/expenses',
  tags: ['Matters: Expenses'],
  summary: 'Create expense',
  description: 'Add an expense to a matter',
  request: {
    params: matterUuidParamSchema,
    body: {
      content: {
        'application/json': {
          schema: matterExpenseValidations.createMatterExpenseSchema,
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ expense: matterExpenseValidations.expenseSchema }) } }, description: 'Expense created' },
  },
});

// ==================== MILESTONES ====================

export const listMilestonesRoute = createRoute({
  method: 'get',
  path: '/{practiceId}/matters/{uuid}/milestones',
  tags: ['Matters: Milestones'],
  summary: 'List milestones',
  description: 'Get all milestones for a matter',
  request: { params: matterUuidParamSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ milestones: z.array(matterMilestoneValidations.milestoneSchema) }) } }, description: 'Milestones retrieved' },
  },
});

export const createMilestoneRoute = createRoute({
  method: 'post',
  path: '/{practiceId}/matters/{uuid}/milestones',
  tags: ['Matters: Milestones'],
  summary: 'Create milestone',
  description: 'Add a milestone to a matter',
  request: {
    params: matterUuidParamSchema,
    body: {
      content: {
        'application/json': {
          schema: matterMilestoneValidations.createMatterMilestoneSchema,
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ milestone: matterMilestoneValidations.milestoneSchema }) } }, description: 'Milestone created' },
  },
});

export const reorderMilestonesRoute = createRoute({
  method: 'post',
  path: '/{practiceId}/matters/{uuid}/milestones/reorder',
  tags: ['Matters: Milestones'],
  summary: 'Reorder milestones',
  description: 'Reorder milestones by providing array of IDs in new order',
  request: {
    params: matterUuidParamSchema,
    body: {
      content: {
        'application/json': {
          schema: matterMilestoneValidations.reorderMilestonesSchema,
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Milestones reordered' },
  },
});

// ==================== ACTIVITY LOG ====================

export const getMatterActivityRoute = createRoute({
  method: 'get',
  path: '/{practiceId}/matters/{uuid}/activity',
  tags: ['Matters: General'],
  summary: 'Get activity log',
  description: 'Get the activity log for a matter',
  request: { params: matterUuidParamSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.array(matterValidations.activityLogSchema) } }, description: 'Activity retrieved' },
  },
});
