/**
 * Matters HTTP Routes
 *
 * Defines all HTTP endpoints for the matters module
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { validateParams, validateJson, validateParamsAndJson, validateQuery } from '@/shared/middleware/validation';
import { response } from '@/shared/utils/responseUtils';
import type { AppContext } from '@/shared/types/hono';

// Services
import * as practiceAreasService from './services/practice-areas.service';
import * as mattersService from './services/matters.service';
import * as notesService from './services/matter-notes.service';
import * as timeEntriesService from './services/matter-time-entries.service';
import * as expensesService from './services/matter-expenses.service';
import * as milestonesService from './services/matter-milestones.service';
import { getMatterActivity } from './services/matter-activity.service';

// Validations
import * as practiceAreasValidation from './validations/practice-areas.validation';
import * as mattersValidation from './validations/matters.validation';
import * as notesValidation from './validations/matter-notes.validation';
import * as timeEntriesValidation from './validations/matter-time-entries.validation';
import * as expensesValidation from './validations/matter-expenses.validation';
import * as milestonesValidation from './validations/matter-milestones.validation';
import { organizationIdParamSchema } from '@/shared/validations/common';

const mattersApp = new OpenAPIHono<AppContext>();

// ==================== PRACTICE AREAS ====================

/**
 * GET /api/organizations/:organizationId/practice-areas
 * List practice areas for an organization
 */
mattersApp.get(
  '/organizations/:organizationId/practice-areas',
  validateParams(organizationIdParamSchema, 'Invalid Organization ID'),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId } = c.get('validatedParams');

    const practiceAreas = await practiceAreasService.listPracticeAreas(
      organizationId,
      user,
      c.req.header(),
    );

    return response.ok(c, { practiceAreas });
  },
);

/**
 * POST /api/organizations/:organizationId/practice-areas
 * Create a practice area
 */
mattersApp.post(
  '/organizations/:organizationId/practice-areas',
  validateParamsAndJson(
    organizationIdParamSchema,
    practiceAreasValidation.createPracticeAreaSchema,
    'Invalid Organization ID',
    'Invalid Practice Area Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const practiceArea = await practiceAreasService.createPracticeArea(
      organizationId,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.created(c, { practiceArea });
  },
);

/**
 * PUT /api/organizations/:organizationId/practice-areas/:uuid
 * Update a practice area
 */
mattersApp.put(
  '/organizations/:organizationId/practice-areas/:uuid',
  validateParamsAndJson(
    organizationIdParamSchema.and(practiceAreasValidation.practiceAreaIdParamSchema),
    practiceAreasValidation.updatePracticeAreaSchema,
    'Invalid Parameters',
    'Invalid Practice Area Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const practiceArea = await practiceAreasService.updatePracticeArea(
      organizationId,
      uuid,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.ok(c, { practiceArea });
  },
);

/**
 * DELETE /api/organizations/:organizationId/practice-areas/:uuid
 * Delete a practice area
 */
mattersApp.delete(
  '/organizations/:organizationId/practice-areas/:uuid',
  validateParams(
    organizationIdParamSchema.and(practiceAreasValidation.practiceAreaIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    await practiceAreasService.deletePracticeArea(organizationId, uuid, user, c.req.header());

    return response.noContent(c);
  },
);

// ==================== MATTERS ====================

/**
 * GET /api/organizations/:organizationId/matters
 * List matters for an organization
 */
mattersApp.get(
  '/organizations/:organizationId/matters',
  validateParams(organizationIdParamSchema, 'Invalid Organization ID'),
  validateQuery(mattersValidation.listMattersQuerySchema, 'Invalid Query Parameters'),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId } = c.get('validatedParams');
    const query = c.get('validatedQuery');

    const result = await mattersService.listMatters(organizationId, query, user, c.req.header());

    return response.ok(c, {
      matters: result.matters,
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    });
  },
);

/**
 * POST /api/organizations/:organizationId/matters
 * Create a matter
 */
mattersApp.post(
  '/organizations/:organizationId/matters',
  validateParamsAndJson(
    organizationIdParamSchema,
    mattersValidation.createMatterSchema,
    'Invalid Organization ID',
    'Invalid Matter Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const matter = await mattersService.createMatter(
      organizationId,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.created(c, { matter });
  },
);

/**
 * GET /api/organizations/:organizationId/matters/:uuid
 * Get matter by ID
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const matter = await mattersService.getMatterById(organizationId, uuid, user, c.req.header());

    return response.ok(c, { matter });
  },
);

/**
 * PUT /api/organizations/:organizationId/matters/:uuid
 * Update matter
 */
mattersApp.put(
  '/organizations/:organizationId/matters/:uuid',
  validateParamsAndJson(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    mattersValidation.updateMatterSchema,
    'Invalid Parameters',
    'Invalid Matter Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const matter = await mattersService.updateMatter(
      organizationId,
      uuid,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.ok(c, { matter });
  },
);

/**
 * DELETE /api/organizations/:organizationId/matters/:uuid
 * Delete matter
 */
mattersApp.delete(
  '/organizations/:organizationId/matters/:uuid',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    await mattersService.deleteMatter(organizationId, uuid, user, c.req.header());

    return response.noContent(c);
  },
);

/**
 * GET /api/organizations/:organizationId/matters/:uuid/activity
 * Get matter activity log
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/activity',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    // Verify access
    await mattersService.getMatterById(organizationId, uuid, user, c.req.header());

    const activities = await getMatterActivity(uuid);

    return response.ok(c, { activities });
  },
);

/**
 * GET /api/organizations/:organizationId/matters/counts
 * Get matter counts by status
 */
mattersApp.get(
  '/organizations/:organizationId/matters-counts',
  validateParams(organizationIdParamSchema, 'Invalid Organization ID'),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId } = c.get('validatedParams');

    const counts = await mattersService.getMatterCounts(organizationId, user, c.req.header());

    return response.ok(c, { counts });
  },
);

// ==================== MATTER NOTES ====================

/**
 * GET /api/organizations/:organizationId/matters/:uuid/notes
 * List notes for a matter
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/notes',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const notes = await notesService.listMatterNotes(organizationId, uuid, user, c.req.header());

    return response.ok(c, { notes });
  },
);

/**
 * POST /api/organizations/:organizationId/matters/:uuid/notes
 * Create a note for a matter
 */
mattersApp.post(
  '/organizations/:organizationId/matters/:uuid/notes',
  validateParamsAndJson(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    notesValidation.createMatterNoteSchema,
    'Invalid Parameters',
    'Invalid Note Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const note = await notesService.createMatterNote(
      organizationId,
      uuid,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.created(c, { note });
  },
);

/**
 * PUT /api/organizations/:organizationId/matters/:uuid/notes/:noteId
 * Update a note
 */
mattersApp.put(
  '/organizations/:organizationId/matters/:uuid/notes/:noteId',
  validateParamsAndJson(
    organizationIdParamSchema.and(notesValidation.matterNoteIdParamSchema),
    notesValidation.updateMatterNoteSchema,
    'Invalid Parameters',
    'Invalid Note Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, noteId } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const note = await notesService.updateMatterNote(
      organizationId,
      uuid,
      noteId,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.ok(c, { note });
  },
);

/**
 * DELETE /api/organizations/:organizationId/matters/:uuid/notes/:noteId
 * Delete a note
 */
mattersApp.delete(
  '/organizations/:organizationId/matters/:uuid/notes/:noteId',
  validateParams(
    organizationIdParamSchema.and(notesValidation.matterNoteIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, noteId } = c.get('validatedParams');

    await notesService.deleteMatterNote(organizationId, uuid, noteId, user, c.req.header());

    return response.noContent(c);
  },
);

// ==================== MATTER TIME ENTRIES ====================

/**
 * GET /api/organizations/:organizationId/matters/:uuid/time-entries
 * List time entries for a matter
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/time-entries',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const timeEntries = await timeEntriesService.listMatterTimeEntries(
      organizationId,
      uuid,
      user,
      c.req.header(),
    );

    return response.ok(c, { timeEntries });
  },
);

/**
 * POST /api/organizations/:organizationId/matters/:uuid/time-entries
 * Create a time entry for a matter
 */
mattersApp.post(
  '/organizations/:organizationId/matters/:uuid/time-entries',
  validateParamsAndJson(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    timeEntriesValidation.createMatterTimeEntrySchema,
    'Invalid Parameters',
    'Invalid Time Entry Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const timeEntry = await timeEntriesService.createMatterTimeEntry(
      organizationId,
      uuid,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.created(c, { timeEntry });
  },
);

/**
 * PUT /api/organizations/:organizationId/matters/:uuid/time-entries/:entryId
 * Update a time entry
 */
mattersApp.put(
  '/organizations/:organizationId/matters/:uuid/time-entries/:entryId',
  validateParamsAndJson(
    organizationIdParamSchema.and(timeEntriesValidation.matterTimeEntryIdParamSchema),
    timeEntriesValidation.updateMatterTimeEntrySchema,
    'Invalid Parameters',
    'Invalid Time Entry Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, entryId } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const timeEntry = await timeEntriesService.updateMatterTimeEntry(
      organizationId,
      uuid,
      entryId,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.ok(c, { timeEntry });
  },
);

/**
 * DELETE /api/organizations/:organizationId/matters/:uuid/time-entries/:entryId
 * Delete a time entry
 */
mattersApp.delete(
  '/organizations/:organizationId/matters/:uuid/time-entries/:entryId',
  validateParams(
    organizationIdParamSchema.and(timeEntriesValidation.matterTimeEntryIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, entryId } = c.get('validatedParams');

    await timeEntriesService.deleteMatterTimeEntry(
      organizationId,
      uuid,
      entryId,
      user,
      c.req.header(),
    );

    return response.noContent(c);
  },
);

/**
 * GET /api/organizations/:organizationId/matters/:uuid/time-entries/stats
 * Get time entry statistics
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/time-entries-stats',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const stats = await timeEntriesService.getTimeEntryStats(
      organizationId,
      uuid,
      user,
      c.req.header(),
    );

    return response.ok(c, { stats });
  },
);

// ==================== MATTER EXPENSES ====================

/**
 * GET /api/organizations/:organizationId/matters/:uuid/expenses
 * List expenses for a matter
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/expenses',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const expenses = await expensesService.listMatterExpenses(
      organizationId,
      uuid,
      user,
      c.req.header(),
    );

    return response.ok(c, { expenses });
  },
);

/**
 * POST /api/organizations/:organizationId/matters/:uuid/expenses
 * Create an expense for a matter
 */
mattersApp.post(
  '/organizations/:organizationId/matters/:uuid/expenses',
  validateParamsAndJson(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    expensesValidation.createMatterExpenseSchema,
    'Invalid Parameters',
    'Invalid Expense Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const expense = await expensesService.createMatterExpense(
      organizationId,
      uuid,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.created(c, { expense });
  },
);

/**
 * PUT /api/organizations/:organizationId/matters/:uuid/expenses/:expenseId
 * Update an expense
 */
mattersApp.put(
  '/organizations/:organizationId/matters/:uuid/expenses/:expenseId',
  validateParamsAndJson(
    organizationIdParamSchema.and(expensesValidation.matterExpenseIdParamSchema),
    expensesValidation.updateMatterExpenseSchema,
    'Invalid Parameters',
    'Invalid Expense Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, expenseId } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const expense = await expensesService.updateMatterExpense(
      organizationId,
      uuid,
      expenseId,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.ok(c, { expense });
  },
);

/**
 * DELETE /api/organizations/:organizationId/matters/:uuid/expenses/:expenseId
 * Delete an expense
 */
mattersApp.delete(
  '/organizations/:organizationId/matters/:uuid/expenses/:expenseId',
  validateParams(
    organizationIdParamSchema.and(expensesValidation.matterExpenseIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, expenseId } = c.get('validatedParams');

    await expensesService.deleteMatterExpense(organizationId, uuid, expenseId, user, c.req.header());

    return response.noContent(c);
  },
);

/**
 * GET /api/organizations/:organizationId/matters/:uuid/expenses/stats
 * Get expense statistics
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/expenses-stats',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const stats = await expensesService.getExpenseStats(organizationId, uuid, user, c.req.header());

    return response.ok(c, { stats });
  },
);

// ==================== MATTER MILESTONES ====================

/**
 * GET /api/organizations/:organizationId/matters/:uuid/milestones
 * List milestones for a matter
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/milestones',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const milestones = await milestonesService.listMatterMilestones(
      organizationId,
      uuid,
      user,
      c.req.header(),
    );

    return response.ok(c, { milestones });
  },
);

/**
 * POST /api/organizations/:organizationId/matters/:uuid/milestones
 * Create a milestone for a matter
 */
mattersApp.post(
  '/organizations/:organizationId/matters/:uuid/milestones',
  validateParamsAndJson(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    milestonesValidation.createMatterMilestoneSchema,
    'Invalid Parameters',
    'Invalid Milestone Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const milestone = await milestonesService.createMatterMilestone(
      organizationId,
      uuid,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.created(c, { milestone });
  },
);

/**
 * PUT /api/organizations/:organizationId/matters/:uuid/milestones/:milestoneId
 * Update a milestone
 */
mattersApp.put(
  '/organizations/:organizationId/matters/:uuid/milestones/:milestoneId',
  validateParamsAndJson(
    organizationIdParamSchema.and(milestonesValidation.matterMilestoneIdParamSchema),
    milestonesValidation.updateMatterMilestoneSchema,
    'Invalid Parameters',
    'Invalid Milestone Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, milestoneId } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    const milestone = await milestonesService.updateMatterMilestone(
      organizationId,
      uuid,
      milestoneId,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.ok(c, { milestone });
  },
);

/**
 * DELETE /api/organizations/:organizationId/matters/:uuid/milestones/:milestoneId
 * Delete a milestone
 */
mattersApp.delete(
  '/organizations/:organizationId/matters/:uuid/milestones/:milestoneId',
  validateParams(
    organizationIdParamSchema.and(milestonesValidation.matterMilestoneIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid, milestoneId } = c.get('validatedParams');

    await milestonesService.deleteMatterMilestone(
      organizationId,
      uuid,
      milestoneId,
      user,
      c.req.header(),
    );

    return response.noContent(c);
  },
);

/**
 * POST /api/organizations/:organizationId/matters/:uuid/milestones/reorder
 * Reorder milestones
 */
mattersApp.post(
  '/organizations/:organizationId/matters/:uuid/milestones-reorder',
  validateParamsAndJson(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    milestonesValidation.reorderMilestonesSchema,
    'Invalid Parameters',
    'Invalid Reorder Data',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');
    const validatedBody = c.get('validatedBody');

    await milestonesService.reorderMilestones(
      organizationId,
      uuid,
      validatedBody,
      user,
      c.req.header(),
    );

    return response.ok(c, { success: true });
  },
);

/**
 * GET /api/organizations/:organizationId/matters/:uuid/milestones/stats
 * Get milestone statistics
 */
mattersApp.get(
  '/organizations/:organizationId/matters/:uuid/milestones-stats',
  validateParams(
    organizationIdParamSchema.and(mattersValidation.matterIdParamSchema),
    'Invalid Parameters',
  ),
  async (c) => {
    const user = c.get('user')!;
    const { organizationId, uuid } = c.get('validatedParams');

    const stats = await milestonesService.getMilestoneStats(
      organizationId,
      uuid,
      user,
      c.req.header(),
    );

    return response.ok(c, { stats });
  },
);

export default mattersApp;
