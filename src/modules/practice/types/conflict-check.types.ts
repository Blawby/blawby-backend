export type ConflictCheckStatus = 'clear' | 'review_required' | 'conflicted' | 'insufficient_data';

export type ConflictCheckInput = {
  name: string;
  date_of_birth?: string;
  opposing_party?: string;
  aliases?: string[];
  matter_id?: string;
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
  }>;
  suggested_next_action: string;
};
