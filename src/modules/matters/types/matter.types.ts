import { z } from 'zod';
import { matterValidations } from '@/modules/matters/validations/matters.validation';
import { matterExpenseValidations } from '@/modules/matters/validations/matter-expenses.validation';
import { matterMilestoneValidations } from '@/modules/matters/validations/matter-milestones.validation';
import { matterNoteValidations } from '@/modules/matters/validations/matter-notes.validation';
import { matterTimeEntryValidations } from '@/modules/matters/validations/matter-time-entries.validation';
import { practiceAreaValidations } from '@/modules/matters/validations/practice-areas.validation';

import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { SelectPracticeArea } from '@/modules/matters/database/schema/practice-areas.schema';
import type { SelectMatterNote } from '@/modules/matters/database/schema/matter-notes.schema';
import type { SelectMatterTimeEntry } from '@/modules/matters/database/schema/matter-time-entries.schema';
import type { SelectMatterExpense } from '@/modules/matters/database/schema/matter-expenses.schema';
import type { SelectMatterMilestone } from '@/modules/matters/database/schema/matter-milestones.schema';
import type { SelectMatterActivityLog } from '@/modules/matters/database/schema/matter-activity-log.schema';

/**
 * Matter with relations
 */
export type MatterWithRelations = SelectMatter & {
  assignees?: Array<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
  }>;
  milestones?: SelectMatterMilestone[];
  practiceArea?: SelectPracticeArea;
  customer?: {
    id: string;
    name: string;
    email: string;
  };
};

/**
 * Matter list response
 */
export type MatterListResponse = {
  matters: SelectMatter[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * Matter activity response
 */
export type MatterActivityResponse = {
  activities: SelectMatterActivityLog[];
  total: number;
};

/**
 * Matter statistics
 */
export type MatterStats = {
  counts: Record<string, number>;
  totalDraft: number;
  totalActive: number;
};

/**
 * Billing calculation result
 */
export type BillingCalculation = {
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
};

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

export type CreateMatterTimeEntryRequest = z.infer<typeof matterTimeEntryValidations.createMatterTimeEntrySchema>;
export type UpdateMatterTimeEntryRequest = z.infer<typeof matterTimeEntryValidations.updateMatterTimeEntrySchema>;

export type CreatePracticeAreaRequest = z.infer<typeof practiceAreaValidations.createPracticeAreaSchema>;
export type UpdatePracticeAreaRequest = z.infer<typeof practiceAreaValidations.updatePracticeAreaSchema>;

export type MatterResponse = z.infer<typeof matterValidations.matterSchema>;
export type ExpenseResponse = z.infer<typeof matterExpenseValidations.expenseSchema>;
export type MilestoneResponse = z.infer<typeof matterMilestoneValidations.milestoneSchema>;
export type MatterNoteResponse = z.infer<typeof matterNoteValidations.matterNoteSchema>;
export type TimeEntryResponse = z.infer<typeof matterTimeEntryValidations.timeEntrySchema>;
export type PracticeAreaResponse = z.infer<typeof practiceAreaValidations.practiceAreaSchema>;
