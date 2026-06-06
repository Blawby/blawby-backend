export type ConflictCheckStatus = 'clear' | 'review_required' | 'conflicted' | 'insufficient_data';

export type ConflictCheckWarningType = 'unsupported_service' | 'unsupported_state';

export type ConflictCheckWarning = {
  type: ConflictCheckWarningType;
  message: string;
};

export type ConflictCheckInput = {
  name: string;
  date_of_birth?: string;
  opposing_party?: string;
  aliases?: string[];
  matter_id?: string;
  state?: string;
  practice_service_key?: string;
};

export type ConflictCheckResult = {
  status: ConflictCheckStatus;
  conflicting_matters: Array<{
    matter_id: string;
    title: string;
    similarity_score: number;
    match_field: 'on_behalf_of' | 'opposing_party';
  }>;
  conflicting_contacts: Array<{
    client_id: string;
    name: string;
    similarity_score: number;
    dob_match: boolean | null;
  }>;
  warnings: ConflictCheckWarning[];
  suggested_next_action: string;
};
