/**
 * Filter types for Matter query functions.
 * Extracted from inline definitions for better reusability.
 */

/** Filters for listMattersByOrganization */
export interface MatterListFilters {
  status?: string;
  practiceServiceId?: string;
  clientId?: string;
  matterId?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Filters for listMatterNotes */
export interface MatterNoteListFilters {
  noteId?: string;
}

/** Filters for listMatterTimeEntries */
export interface MatterTimeEntryListFilters {
  billable?: boolean;
  startDate?: Date;
  endDate?: Date;
  entryId?: string;
}

/** Filters for listMatterExpenses */
export interface MatterExpenseListFilters {
  billable?: boolean;
  startDate?: Date;
  endDate?: Date;
  expenseId?: string;
}

/** Filters for listMatterMilestones */
export interface MatterMilestoneListFilters {
  milestoneId?: string;
}

/** Filters for listMatterTasks */
export interface MatterTaskListFilters {
  taskId?: string;
  assigneeId?: string;
  status?: 'pending' | 'in_progress' | 'complete' | 'blocked';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  stage?: string;
}

/** Filters for getMatterActivity */
export interface MatterActivityListFilters {
  limit?: number;
  offset?: number;
  activityId?: string;
}
