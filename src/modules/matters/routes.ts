import { createRoute, z } from '@hono/zod-openapi';
import { matterExpenseValidations } from '@/modules/matters/validations/matter-expenses.validation';
import { matterMilestoneValidations } from '@/modules/matters/validations/matter-milestones.validation';
import { matterNoteValidations } from '@/modules/matters/validations/matter-notes.validation';
import { matterTimeEntryValidations } from '@/modules/matters/validations/matter-time-entries.validation';
import { matterValidations } from '@/modules/matters/validations/matters.validation';
import {
  errorResponseSchema,
  notFoundResponseSchema,
  practiceIdParamSchema,
  matterIdParamSchema,
} from '@/shared/validations/openapi';

// [REMOVED Practice Areas routes - Services are fetched from practice-details]

const matterNoteParamsSchema = matterIdParamSchema.extend({
  noteId: z.uuid().openapi({
    param: { name: 'noteId', in: 'path' },
    description: 'Note ID (UUID)',
    example: '9b9a7f35-9f0e-4a2d-9e8b-5a8d71fa2f11',
  }),
});

const matterTimeEntryParamsSchema = matterIdParamSchema.extend({
  entryId: z.uuid().openapi({
    param: { name: 'entryId', in: 'path' },
    description: 'Time entry ID (UUID)',
    example: 'db4f6797-2bb8-4ed8-9d38-9c07f40d4b0d',
  }),
});

const matterExpenseParamsSchema = matterIdParamSchema.extend({
  expenseId: z.uuid().openapi({
    param: { name: 'expenseId', in: 'path' },
    description: 'Expense ID (UUID)',
    example: '5e0a120a-87ac-4e61-90ab-38d91bf6cc8d',
  }),
});

const matterMilestoneParamsSchema = matterIdParamSchema.extend({
  milestoneId: z.uuid().openapi({
    param: { name: 'milestoneId', in: 'path' },
    description: 'Milestone ID (UUID)',
    example: '9a33c3d5-0c6b-43a4-9b46-7a0d80d1e6b4',
  }),
});

// ==================== MATTERS ====================

export const createMatterRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/create',
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

export const getMattersRoute = createRoute({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Matters: General'],
  summary: 'List matters or get by ID',
  description: 'Get all matters for a practice. Use the `matter_id` query parameter to retrieve a specific matter.',
  request: {
    params: practiceIdParamSchema,
    query: matterValidations.listMattersQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            matters: z.array(matterValidations.matterSchema),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
            totalPages: z.number(),
          }),
        },
      },
      description: 'Matters retrieved successfully',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});


export const updateMatterRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/update/{id}',
  tags: ['Matters: General'],
  summary: 'Update matter',
  description: 'Update a matter',
  request: {
    params: matterIdParamSchema,
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
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Matter not found' },
  },
});

export const deleteMatterRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/delete/{id}',
  tags: ['Matters: General'],
  summary: 'Delete matter',
  description: 'Soft delete a matter',
  request: { params: matterIdParamSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Matter deleted successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: notFoundResponseSchema,
        },
      },
      description: 'Matter not found',
    },
  },
});

// ==================== MATTER NOTES ====================

export const listMatterNotesRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/{id}/notes',
  tags: ['Matters: Notes'],
  summary: 'List notes or get by ID',
  description: 'Get all notes for a matter. Use the `note_id` query parameter to retrieve a specific note.',
  request: {
    params: matterIdParamSchema,
    query: matterNoteValidations.listMatterNotesQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ notes: z.array(matterNoteValidations.matterNoteSchema) }) } }, description: 'Notes retrieved' },
  },
});

export const createMatterNoteRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/{id}/notes',
  tags: ['Matters: Notes'],
  summary: 'Create note',
  description: 'Create a note for a matter',
  request: {
    params: matterIdParamSchema,
    body: { content: { 'application/json': { schema: matterNoteValidations.createMatterNoteSchema } } },
  },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ note: matterNoteValidations.matterNoteSchema }) } }, description: 'Note created' },
  },
});

export const updateMatterNoteRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/{id}/notes/update/{noteId}',
  tags: ['Matters: Notes'],
  summary: 'Update note',
  description: 'Update a note for a matter',
  request: {
    params: matterNoteParamsSchema,
    body: { content: { 'application/json': { schema: matterNoteValidations.updateMatterNoteSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ note: matterNoteValidations.matterNoteSchema }) } }, description: 'Note updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Note not found' },
  },
});

export const deleteMatterNoteRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/{id}/notes/delete/{noteId}',
  tags: ['Matters: Notes'],
  summary: 'Delete note',
  description: 'Delete a note for a matter',
  request: { params: matterNoteParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Note deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Note not found' },
  },
});

// ==================== TIME ENTRIES ====================

export const listTimeEntriesRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/{id}/time-entries',
  tags: ['Matters: Time Entries'],
  summary: 'List time entries or get by ID',
  description: 'Get all time entries for a matter. Use the `entry_id` query parameter to retrieve a specific entry.',
  request: {
    params: matterIdParamSchema,
    query: matterTimeEntryValidations.listTimeEntriesQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ timeEntries: z.array(matterTimeEntryValidations.timeEntrySchema) }) } }, description: 'Time entries retrieved' },
  },
});

export const createTimeEntryRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/{id}/time-entries',
  tags: ['Matters: Time Entries'],
  summary: 'Create time entry',
  description: 'Log time for a matter (duration calculated automatically)',
  request: {
    params: matterIdParamSchema,
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

export const updateTimeEntryRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/{id}/time-entries/update/{entryId}',
  tags: ['Matters: Time Entries'],
  summary: 'Update time entry',
  description: 'Update a time entry for a matter',
  request: {
    params: matterTimeEntryParamsSchema,
    body: { content: { 'application/json': { schema: matterTimeEntryValidations.updateMatterTimeEntrySchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ timeEntry: matterTimeEntryValidations.timeEntrySchema }) } }, description: 'Time entry updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Time entry not found' },
  },
});

export const deleteTimeEntryRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/{id}/time-entries/delete/{entryId}',
  tags: ['Matters: Time Entries'],
  summary: 'Delete time entry',
  description: 'Delete a time entry for a matter',
  request: { params: matterTimeEntryParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Time entry deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Time entry not found' },
  },
});

export const getTimeEntryStatsRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/{id}/time-entries/stats',
  tags: ['Matters: Time Entries'],
  summary: 'Get time statistics',
  description: 'Get total billable and non-billable time for a matter',
  request: { params: matterIdParamSchema },
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
  path: '/{practice_id}/{id}/expenses',
  tags: ['Matters: Expenses'],
  summary: 'List expenses or get by ID',
  description: 'Get all expenses for a matter. Use the `expense_id` query parameter to retrieve a specific expense.',
  request: {
    params: matterIdParamSchema,
    query: matterExpenseValidations.listExpensesQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ expenses: z.array(matterExpenseValidations.expenseSchema) }) } }, description: 'Expenses retrieved' },
  },
});

export const createExpenseRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/{id}/expenses',
  tags: ['Matters: Expenses'],
  summary: 'Create expense',
  description: 'Add an expense to a matter',
  request: {
    params: matterIdParamSchema,
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

export const updateExpenseRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/{id}/expenses/update/{expenseId}',
  tags: ['Matters: Expenses'],
  summary: 'Update expense',
  description: 'Update an expense for a matter',
  request: {
    params: matterExpenseParamsSchema,
    body: { content: { 'application/json': { schema: matterExpenseValidations.updateMatterExpenseSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ expense: matterExpenseValidations.expenseSchema }) } }, description: 'Expense updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Expense not found' },
  },
});

export const deleteExpenseRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/{id}/expenses/delete/{expenseId}',
  tags: ['Matters: Expenses'],
  summary: 'Delete expense',
  description: 'Delete an expense for a matter',
  request: { params: matterExpenseParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Expense deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Expense not found' },
  },
});

// ==================== MILESTONES ====================

export const listMilestonesRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/{id}/milestones',
  tags: ['Matters: Milestones'],
  summary: 'List milestones or get by ID',
  description: 'Get all milestones for a matter. Use the `milestone_id` query parameter to retrieve a specific milestone.',
  request: {
    params: matterIdParamSchema,
    query: matterMilestoneValidations.listMilestonesQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ milestones: z.array(matterMilestoneValidations.milestoneSchema) }) } }, description: 'Milestones retrieved' },
  },
});

export const createMilestoneRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/{id}/milestones',
  tags: ['Matters: Milestones'],
  summary: 'Create milestone',
  description: 'Add a milestone to a matter',
  request: {
    params: matterIdParamSchema,
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

export const updateMilestoneRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/{id}/milestones/update/{milestoneId}',
  tags: ['Matters: Milestones'],
  summary: 'Update milestone',
  description: 'Update a milestone for a matter',
  request: {
    params: matterMilestoneParamsSchema,
    body: { content: { 'application/json': { schema: matterMilestoneValidations.updateMatterMilestoneSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ milestone: matterMilestoneValidations.milestoneSchema }) } }, description: 'Milestone updated' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Milestone not found' },
  },
});

export const deleteMilestoneRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/{id}/milestones/delete/{milestoneId}',
  tags: ['Matters: Milestones'],
  summary: 'Delete milestone',
  description: 'Delete a milestone for a matter',
  request: { params: matterMilestoneParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Milestone deleted' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Milestone not found' },
  },
});

export const reorderMilestonesRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/{id}/milestones/reorder',
  tags: ['Matters: Milestones'],
  summary: 'Reorder milestones',
  description: 'Reorder milestones by providing array of IDs in new order',
  request: {
    params: matterIdParamSchema,
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
  path: '/{practice_id}/{id}/activity',
  tags: ['Matters: General'],
  summary: 'Get activity log or get by ID',
  description: 'Get the activity log for a matter. Use the `activity_id` query parameter to retrieve a specific log entry.',
  request: {
    params: matterIdParamSchema,
    query: matterValidations.getActivityLogQuerySchema,
  },
  responses: {
    200: { content: { 'application/json': { schema: z.array(matterValidations.activityLogSchema) } }, description: 'Activity retrieved' },
  },
});
