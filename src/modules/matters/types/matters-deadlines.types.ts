export type CreateDeadlineInput = {
  name: string;
  date: string;
  type: 'court' | 'statutory' | 'internal' | 'reminder';
  source?: string;
  alert_days_before?: number[];
};

export type UpdateDeadlineInput = {
  name?: string;
  date?: string;
  type?: 'court' | 'statutory' | 'internal' | 'reminder';
  source?: string | null;
  alert_days_before?: number[];
};
