/**
 * Filter types for Matter query functions.
 * Extracted from inline definitions for better reusability.
 */

/** Filters for listMattersByOrganization */
export type MatterListFilters = {
  status?: string;
  practiceServiceId?: string;
  clientId?: string;
  matterId?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

/** Filters for listMatterNotes */
export type MatterNoteListFilters = {
  noteId?: string;
};

/** Filters for listMatterTimeEntries */
export type MatterTimeEntryListFilters = {
  billable?: boolean;
  startDate?: Date;
  endDate?: Date;
  entryId?: string;
};

/** Filters for listMatterExpenses */
export type MatterExpenseListFilters = {
  billable?: boolean;
  startDate?: Date;
  endDate?: Date;
  expenseId?: string;
};

/** Filters for listMatterMilestones */
export type MatterMilestoneListFilters = {
  milestoneId?: string;
};

/** Filters for listMatterTasks */
export type MatterTaskListFilters = {
  taskId?: string;
  assigneeId?: string;
  status?: 'pending' | 'in_progress' | 'complete' | 'blocked';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  stage?: string;
};

/** Filters for getMatterActivity */
export type MatterActivityListFilters = {
  limit?: number;
  offset?: number;
  activityId?: string;
};
