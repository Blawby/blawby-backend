/**
 * Matter Types
 *
 * Type definitions for matters module
 */

import type { SelectMatter } from '../database/schema/matters.schema';
import type { SelectPracticeArea } from '../database/schema/practice-areas.schema';
import type { SelectMatterNote } from '../database/schema/matter-notes.schema';
import type { SelectMatterTimeEntry } from '../database/schema/matter-time-entries.schema';
import type { SelectMatterExpense } from '../database/schema/matter-expenses.schema';
import type { SelectMatterMilestone } from '../database/schema/matter-milestones.schema';
import type { SelectMatterActivityLog } from '../database/schema/matter-activity-log.schema';

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
    image?: string | null;
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
