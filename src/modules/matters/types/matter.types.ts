import type { z } from '@hono/zod-openapi';
import type { SelectMatterActivityLog } from '@/modules/matters/database/schema/matter-activity-log.schema';
import type { SelectMatterMilestone } from '@/modules/matters/database/schema/matter-milestones.schema';
import type { SelectMatterStatusHistory } from '@/modules/matters/database/schema/matter-status-history.schema';
import type { SelectMatterTask } from '@/modules/matters/database/schema/matter-tasks.schema';
import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import { matterExpenseValidations } from '@/modules/matters/validations/matter-expenses.validation';
import { matterMilestoneValidations } from '@/modules/matters/validations/matter-milestones.validation';
import { matterNoteValidations } from '@/modules/matters/validations/matter-notes.validation';
import { matterTaskValidations } from '@/modules/matters/validations/matter-tasks.validation';
import { matterTimeEntryValidations } from '@/modules/matters/validations/matter-time-entries.validation';
import { matterValidations } from '@/modules/matters/validations/matters.validation';
// Export schemas
export const createMatterRequestSchema = matterValidations.createMatterSchema;
export const updateMatterRequestSchema = matterValidations.updateMatterSchema;
export const { listMattersQuerySchema } = matterValidations;
export const matterResponseSchema = matterValidations.matterSchema;
export const matterInternalResponseSchema = matterValidations.matterSchema; // Internal same as public for now

export const createMatterExpenseRequestSchema = matterExpenseValidations.createMatterExpenseSchema;
export const updateMatterExpenseRequestSchema = matterExpenseValidations.updateMatterExpenseSchema;
export const matterExpenseResponseSchema = matterExpenseValidations.expenseSchema;
export const listMatterExpensesQuerySchema = matterExpenseValidations.listExpensesQuerySchema;

export const { getActivityLogQuerySchema } = matterValidations;

export const createMatterMilestoneRequestSchema = matterMilestoneValidations.createMatterMilestoneSchema;
export const updateMatterMilestoneRequestSchema = matterMilestoneValidations.updateMatterMilestoneSchema;
export const reorderMatterMilestonesRequestSchema = matterMilestoneValidations.reorderMilestonesSchema;
export const matterMilestoneResponseSchema = matterMilestoneValidations.milestoneSchema;
export const listMatterMilestonesQuerySchema = matterMilestoneValidations.listMilestonesQuerySchema;

export const createMatterNoteRequestSchema = matterNoteValidations.createMatterNoteSchema;
export const updateMatterNoteRequestSchema = matterNoteValidations.updateMatterNoteSchema;
export const matterNoteResponseSchema = matterNoteValidations.matterNoteSchema;
export const { listMatterNotesQuerySchema } = matterNoteValidations;

export const createMatterTimeEntryRequestSchema = matterTimeEntryValidations.createMatterTimeEntrySchema;
export const updateMatterTimeEntryRequestSchema = matterTimeEntryValidations.updateMatterTimeEntrySchema;
export const matterTimeEntryResponseSchema = matterTimeEntryValidations.timeEntrySchema;
export const listMatterTimeEntriesQuerySchema = matterTimeEntryValidations.listTimeEntriesQuerySchema;

export const createMatterTaskRequestSchema = matterTaskValidations.createMatterTaskSchema;
export const updateMatterTaskRequestSchema = matterTaskValidations.updateMatterTaskSchema;
export const matterTaskResponseSchema = matterTaskValidations.matterTaskSchema;
export const listMatterTasksQuerySchema = matterTaskValidations.listMatterTasksQuerySchema;

/**
 * Matter with relations
 */
export type MatterWithRelations = SelectMatter & {
  assignees?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  }[];
  milestones?: SelectMatterMilestone[];
  tasks?: SelectMatterTask[];
  customer?: {
    id: string;
    name: string;
    email: string;
  };
};

/**
 * Matter record as returned by the service layer.
 *
 * Dates remain as `Date` objects (Drizzle's native `mode: 'date'`).
 * Hono/OpenAPI serialisation handles the Date→string conversion at
 * the boundary, so services never need `.toISOString()` calls.
 */
export type MatterRecord = SelectMatter & {
  assignees?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  }[];
  milestones?: SelectMatterMilestone[];
  client?: {
    id: string;
    name: string;
    email: string;
  } | null;
};

/**
 * Matter list response
 */
export interface MatterListResponse {
  matters: SelectMatter[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Matter activity response
 */
export interface MatterActivityResponse {
  activities: SelectMatterActivityLog[];
  total: number;
}

/**
 * Matter status history response
 */
export interface MatterStatusHistoryResponse {
  history: SelectMatterStatusHistory[];
  total: number;
}

/**
 * Matter statistics
 */
export interface MatterStats {
  counts: Record<string, number>;
  totalDraft: number;
  totalActive: number;
}

/**
 * Billing calculation result
 */
export interface BillingCalculation {
  billingType: string;
  timeEntries: {
    totalHours: number;
    totalBillableHours: number;
    totalAmount?: number;
  };
  expenses: {
    total: number;
    totalBillable: number;
  };
  milestones: {
    total: number;
    completed: number;
    totalAmount: number;
    completedAmount: number;
    completionPercentage: number;
  };
  totalBillable: number;
}

// Inferred from Zod schemas
export type CreateMatterRequest = z.infer<typeof matterValidations.createMatterSchema>;
export type UpdateMatterRequest = z.infer<typeof matterValidations.updateMatterSchema>;
export type ListMattersQuery = z.infer<typeof matterValidations.listMattersQuerySchema>;

export type CreateMatterExpenseRequest = z.infer<typeof matterExpenseValidations.createMatterExpenseSchema>;
export type UpdateMatterExpenseRequest = z.infer<typeof matterExpenseValidations.updateMatterExpenseSchema>;

export type CreateMatterMilestoneRequest = z.infer<typeof matterMilestoneValidations.createMatterMilestoneSchema>;
export type UpdateMatterMilestoneRequest = z.infer<typeof matterMilestoneValidations.updateMatterMilestoneSchema>;
export type ReorderMilestonesRequest = z.infer<typeof matterMilestoneValidations.reorderMilestonesSchema>;

export type CreateMatterNoteRequest = z.infer<typeof matterNoteValidations.createMatterNoteSchema>;
export type UpdateMatterNoteRequest = z.infer<typeof matterNoteValidations.updateMatterNoteSchema>;

export type CreateMatterTaskRequest = z.infer<typeof matterTaskValidations.createMatterTaskSchema>;
export type UpdateMatterTaskRequest = z.infer<typeof matterTaskValidations.updateMatterTaskSchema>;
export type GenerateMatterTasksFromTemplateRequest = z.infer<
  typeof matterTaskValidations.generateTasksFromTemplateSchema
>;

export type CreateMatterTimeEntryRequest = z.infer<typeof matterTimeEntryValidations.createMatterTimeEntrySchema>;
export type UpdateMatterTimeEntryRequest = z.infer<typeof matterTimeEntryValidations.updateMatterTimeEntrySchema>;

export type MatterResponse = z.infer<typeof matterValidations.matterSchema>;
export type ExpenseResponse = z.infer<typeof matterExpenseValidations.expenseSchema>;
export type MilestoneResponse = z.infer<typeof matterMilestoneValidations.milestoneSchema>;
export type MatterNoteResponse = z.infer<typeof matterNoteValidations.matterNoteSchema>;
export type MatterTaskResponse = z.infer<typeof matterTaskValidations.matterTaskSchema>;
export type TimeEntryResponse = z.infer<typeof matterTimeEntryValidations.timeEntrySchema>;

export interface UnbilledTimeEntry {
  id: string;
  description: string | null;
  duration_minutes: number;
  hourly_rate: number;
  total: number;
  created_at: string;
  user_id: string | null;
}

export interface UnbilledExpense {
  id: string;
  description: string | null;
  amount: number;
  created_at: string;
}

export interface UnbilledMilestone {
  id: string;
  description: string | null;
  amount: number;
  status: string;
  due_date: string | null;
  order: number;
}

export interface UnbilledMatterData {
  time_entries: UnbilledTimeEntry[];
  expenses: UnbilledExpense[];
  milestones: UnbilledMilestone[];
  connected_account_id: string | null;
}
